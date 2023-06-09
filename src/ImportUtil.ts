import { BoostDeal, ImportOptions } from './Types.js';
import parse from 'parse-duration';
import JsonRpcClient from './JsonRpcClient.js';
import { GraphQLClient, gql } from 'graphql-request';
import MultipartDownload from 'multipart-download';
import fs from 'fs-extra';
import path from 'path';
import Semaphore from 'semaphore-async-await';
import { CurrentTimestamp, HeightToTimestamp } from './ChainHeight.js';
import retry from 'async-retry';

function sleep (ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class ImportUtil {
  public static throwError (message: string) {
    throw new Error(message);
  }

  private static resolveApiInfo (apiInfo: string, prefix = 'Filecoin.'): JsonRpcClient {
    const [minerToken, minerApi] = apiInfo.split(':');
    let ip = minerApi.split('/')[2];
    if (ip === '0.0.0.0') {
      ip = '127.0.0.1';
    }
    const port = minerApi.split('/')[4];
    return new JsonRpcClient(`http://${ip}:${port}/rpc/v0`, prefix, {
      headers: {
        Authorization: `Bearer ${minerToken}`
      }
    });
  }

  private static parseDuration (duration: string): number {
    if (isNaN(Number(duration))) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      return parse(duration, 's');
    } else {
      return Number(duration);
    }
  }

  private static validateImportOptions (options: ImportOptions): ImportOptions {
    console.log(options);
    if (!process.env.MARKETS_API_INFO ||
      !process.env.BOOST_GRAPHQL_ENDPOINT) {
      ImportUtil.throwError('Make sure you have all of the following environment variables set: MARKETS_API_INFO, BOOST_GRAPHQL_ENDPOINT');
    }

    if (!options.client) {
      console.warn('No clients specified. Importing deals from all clients.');
    }

    if (!options.since) {
      console.warn('No --since specified. Importing deals from all time.');
    }

    if (options.since) {
      options.sinceSeconds = ImportUtil.parseDuration(options.since);
    } else {
      options.sinceSeconds = 30 * 86400;
    }

    options.sealingDurationSeconds = ImportUtil.parseDuration(options.sealingDuration);
    if (options.sealingDurationSeconds < 4 * 3600) {
      ImportUtil.throwError('Sealing duration must be at least 4 hours.');
    }

    if (!options.path && !options.urlTemplate) {
      ImportUtil.throwError('Either --path or --url-template must be specified.');
    }

    if (options.urlTemplate && !options.downloadFolder) {
      ImportUtil.throwError('If --url-template is specified, --download-folder must also be specified.');
    }

    options.intervalSeconds = ImportUtil.parseDuration(options.interval);
    if (options.intervalSeconds < 0) {
      ImportUtil.throwError('Interval must be greater than 0.');
    }

    if (options.downloadConcurrency < 1) {
      ImportUtil.throwError('Download concurrency must be at least 1.');
    }

    if (options.dryRun) {
      console.warn('Dry run is enabled. No deals will be imported or downloaded.');
    }

    options.marketApiClient = ImportUtil.resolveApiInfo(process.env.MARKETS_API_INFO!);
    options.boostGqlClient = new GraphQLClient(process.env.BOOST_GRAPHQL_ENDPOINT! + '/graphql/query',
      {
        timeout: 60000
      });
    return options;
  }

  private static knownBadDeals: Set<string> = new Set<string>();

  private static downloading: Set<string> = new Set<string>();

  // eslint-disable-next-line new-cap
  private static downloadSemaphore : Semaphore.default = new Semaphore.default(1);

  public static async startImportLoop (options: ImportOptions) {
    options = await ImportUtil.validateImportOptions(options);
    if (!options.loop) {
      await ImportUtil.startImport(options);
    } else {
      while (true) {
        try {
          await ImportUtil.startImport(options);
        } catch (e) {
          console.error(e);
        }
        await sleep(60 * 1000);
      }
    }
  }

  private static async downloadFile (url: string, dest: string, threads: number) {
    return new Promise((resolve, reject) => {
      const downloader = new MultipartDownload();
      dest = path.resolve(dest);
      downloader.start(url, {
        fileName: path.basename(dest),
        saveDirectory: path.dirname(dest),
        numOfConnections: threads
      });
      downloader.on('error', reject);
      downloader.on('end', () => {
        resolve(undefined);
      });
    });
  }

  private static async download (url: string, dest: string, options: ImportOptions) {
    await ImportUtil.downloadSemaphore.acquire();
    try {
      console.log(`Downloading ${url} to ${dest}`);
      if (!options.dryRun) {
        await fs.ensureDir(options.downloadFolder!);
        await ImportUtil.downloadFile(url, dest + '.downloading', options.downloadThreads);
        await fs.rename(dest + '.downloading', dest);
      }
    } finally {
      ImportUtil.downloadSemaphore.release();
      await fs.remove(dest + '.downloading');
    }
  }

  private static async importDeal (
    existingPath: string,
    dealId: string,
    options: ImportOptions) {
    console.log(`[${dealId}] Importing ${existingPath}`);
    try {
      if (!options.dryRun) {
        const response = await options.marketApiClient.call('BoostOfflineDealWithData', [dealId, path.resolve(existingPath), false]);
        if (response.error) {
          throw response.error;
        }
      }
    } catch (e) {
      console.error(e);
      ImportUtil.knownBadDeals.add(dealId);
      console.log(`[${dealId} Will no longer handle this deal`);
    }
  }

  private static async getDeals (options: ImportOptions) : Promise<BoostDeal[]> {
    const query = gql`
    {
      deals(limit: 10000) {
        deals {
          ID PieceCid CreatedAt ClientAddress Message StartEpoch DealDataRoot PieceSize
        }
      }
    }`;
    const response = <any> await options.boostGqlClient.request(query);
    return response.deals.deals;
  }

  private static async startImport (options: ImportOptions) {
    const s32g = 32 * 1024 * 1024 * 1024;
    console.log('Fetching deals from Boost Markets...');
    let deals = await ImportUtil.getDeals(options);
    if (options.reverse) {
      deals = deals.reverse();
    }
    let pc1 = 0;
    let potentialPc1 = 0;
    for (const deal of deals) {
      const pieceSize = Number(deal.PieceSize.n);
      if (deal.Message === 'Sealer: PreCommit1') {
        potentialPc1 += pieceSize;
        pc1 += pieceSize;
      } else if (deal.Message === 'Ready to Publish' ||
        deal.Message === 'Awaiting Publish Confirmation' ||
      deal.Message === 'Adding to Sector') {
        potentialPc1 += pieceSize;
      }
    }
    if (options.maxPc1 > 0 && pc1 / s32g >= options.maxPc1) {
      console.log(`Skipping import because ${pc1 / s32g} PC1 are running - max: ${options.maxPc1}.`);
      return;
    }
    for (const deal of deals) {
      if (options.maxPotentialPc1 > 0 && potentialPc1 / s32g >= options.maxPotentialPc1) {
        console.log(`Skipping import because ${potentialPc1 / s32g} PC1 are potentially running - max: ${options.maxPotentialPc1}.`);
        return;
      }
      if (deal.Message !== 'Awaiting Offline Data Import') {
        continue;
      }
      if (ImportUtil.knownBadDeals.has(deal.ID)) {
        continue;
      }
      if (options.client && !options.client.includes(deal.ClientAddress)) {
        console.log(`[${deal.ID}] Proposal comes from unrecognized client address ${deal.ClientAddress}, skipping.`);
        ImportUtil.knownBadDeals.add(deal.ID);
        continue;
      }
      if (Date.now() - Date.parse(deal.CreatedAt) > options.sinceSeconds * 1000) {
        console.log(`[${deal.ID}] Proposal is too old, skipping.`);
        ImportUtil.knownBadDeals.add(deal.ID);
        continue;
      }
      if (HeightToTimestamp(Number(deal.StartEpoch.n)) - options.sealingDurationSeconds < CurrentTimestamp()) {
        console.log(`[${deal.ID}] Proposal has expired or is about to expire, skipping.`);
        ImportUtil.knownBadDeals.add(deal.ID);
        continue;
      }
      let existingPath: string | undefined;
      // Check if the file already exists in --path.
      if (options.path) {
        for (const p of options.path) {
          const dataCidFile = path.resolve(p, deal.DealDataRoot + '.car');
          const pieceCidFile = path.resolve(p, deal.PieceCid + '.car');
          if (await fs.pathExists(pieceCidFile)) {
            existingPath = pieceCidFile;
            break;
          }
          if (await fs.pathExists(dataCidFile)) {
            existingPath = dataCidFile;
            break;
          }
        }
      }
      if (existingPath) {
        try {
          await ImportUtil.importDeal(existingPath, deal.ID, options);
          potentialPc1 += Number(deal.PieceSize.n);
          await sleep(options.intervalSeconds * 1000);
        } catch (e) {
          console.error(`[${deal.ID}] Failed to import ${existingPath}.`, e);
          ImportUtil.knownBadDeals.add(deal.ID);
        }
        continue;
      }

      if (!options.urlTemplate) {
        continue;
      }

      if (ImportUtil.downloading.has(deal.ID)) {
        continue;
      }
      ImportUtil.downloading.add(deal.ID);

      // Download the file to specified download folder
      const pieceCidFile = path.join(options.downloadFolder!, deal.PieceCid + '.car');
      const url = options.urlTemplate
        .replace('{pieceCid}', deal.PieceCid)
        .replace('{dataCid}', deal.DealDataRoot);

      retry(async () => {
        await ImportUtil.download(url, pieceCidFile, options);
      }, {
        retries: options.downloadRetries,
        minTimeout: 300000,
        maxTimeout: 3600000
      }).catch((e) => {
        console.error(`Failed to download ${url} to ${pieceCidFile} after ${options.downloadRetries} retries.`, e);
      }).then(async () => ImportUtil.importDeal(pieceCidFile, deal.ID, options))
        .catch((e) => {
          console.error(`Failed to import ${pieceCidFile} for deal ${deal.ID}.`, e);
          ImportUtil.knownBadDeals.add(deal.ID);
        });
    }
  }
}
