#!/usr/bin/env node

import { Command } from 'commander';
import ImportUtil from "./ImportUtil.js";
import {ImportOptions} from "./Types.js";

const program = new Command();
program.name('singularity-import-boost')
  .description('A tool to automatically import deals to boost');

program.option('-c, --client <addresses...>', 'List of client addresses to filter the deal proposals')
  .option('-p, --path <paths...>', 'List of paths to find the CAR files')
  .option('-s, --since <duration>',
    'Import deals that are proposed since this many seconds old and skip those that are older', String, '1d')
  .option('-sd, --sealing-duration <duration>',
    'Import deals whose start time is more than this many seconds in the future to account for time spent for sealing. Otherwise, ' +
    'sealing will fail if it does not finish before the start time of the deal', String, '6h')
  .option('-u, --url-template <template>',
    'The URL template to download CAR files, if it cannot be found from the specified paths.' +
    ' i.e. https://www.download.org/{dataCid}.car, https://www.download.org/{pieceCid}.car')
  .option('-dt, --download-threads <threads>', 'The number of concurrent threads for downloading',
    Number, 8)
  .option('-dr, --download-retries <retries>', 'The number of exponential retries for each download',
    Number, 3)
  .option('-o, --download-folder <folder>', 'The folder to save the downloaded CAR files')
  .option('-i, --interval <duration>',
    'The interval in seconds between handling applicable deals, including both file downloads and deal importing. ' +
    'The timer starts when the previous import begins so it is possible to have concurrent imports or downloads if the interval is too small,' +
    ' which is probably fine with boost.',
    String, '1m')
  .option('-dc, --download-concurrency <concurrency>', 'This sets an upper limit of concurrent downloads', Number, 1)
  .option('-pc1, --max-pc1 <max_pc1>',
    'The maximum number of PC1s to run concurrently, once reached, stop importing or downloading new deals. 0 for unlimited.', Number, 0)
  .option('-d, --dry-run', 'Do not import deals, just print the deals that would be imported or downloaded', false)
  .option('-l, --loop', 'Keep monitoring the incoming deals and perform the import indefinitely', false)
  .action(async (options: ImportOptions) => {
    await ImportUtil.startImportLoop(options);
  });

program.addHelpText('after', `

Environment Variables:
  Make sure you have one of the following environment variables set:
    - MARKETS_API_INFO, i.e. eyJxxx:/ip4/127.0.0.1/tcp/1289/http"
    - BOOST_GRAPHQL_ENDPOINT, i.e. http://127.0.0.1:8080

Example Usage:
  - Import all deals continuously one after another:
    $ singularity-import -p /path/to/car -i 0 -l
  - Import one deal every 20 minutes with multiple paths
    $ singularity-import -p /path1/to/car -p /path2/to/car -i 1200 -l
  - Import one deal every minute with up to 5 concurrent imports
    $ singularity-import -p /path/to/car -i 60 -ic 5 -l
  - Import deals from a specific client and the file can be downloaded from their HTTP server. Delete the file after importing.
    $ singularity-import -c f1xxxx -u https://www.download.org/ -o ./downloads -i 0 -l -r
`);
program.parse();
