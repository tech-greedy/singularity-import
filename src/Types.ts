import JsonRpcClient from './JsonRpcClient.js';
import { GraphQLClient } from 'graphql-request';

export interface ImportOptions {
  client?: string[],
  path?: string[],
  since?: string,
  sinceSeconds: number,
  sealingDuration: string,
  sealingDurationSeconds: number,
  urlTemplate?: string,
  downloadThreads: number,
  downloadRetries: number,
  downloadFolder?: string,
  interval: string,
  intervalSeconds: number,
  downloadConcurrency: number,
  maxPc1: number,
  dryRun: boolean,
  loop: boolean,
  minerApiClient: JsonRpcClient
  marketApiClient: JsonRpcClient
  boostGqlClient: GraphQLClient
}

export interface BoostDeal {
  ID: string,
  PieceCid: string,
  CreatedAt: string,
  ClientAddress: string,
  Message: string,
  StartEpoch: {
    n: string
  },
  DealDataRoot: string
}
