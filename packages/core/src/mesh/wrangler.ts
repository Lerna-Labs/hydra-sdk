import { HydraInstance, HydraProvider } from '@meshsdk/hydra';
import { BlockfrostProvider } from '@meshsdk/core';

const BLOCKFROST_KEY = process.env.BLOCKFROST_API_KEY as string;
if (!BLOCKFROST_KEY) throw new Error('BLOCKFROST_API_KEY not set');
console.log(`Blockfrost Key: ${BLOCKFROST_KEY.slice(0, 10)}...`);

export interface CommitArgs {
  txHash: string;
  txIndex: number;
}

export class Wrangler {
  private readonly BLOCKFROST_KEY: string;
  private mode: 'start' | 'shutdown' | undefined;
  public readonly provider: HydraProvider;
  private instance: HydraInstance;
  private readonly blockfrost: BlockfrostProvider;
  private readonly url: string;
  private readonly wsUrl: string;

  constructor(url?: string, wsUrl?: string) {
    this.url = url || (process.env.HYDRA_API_URL as string);
    this.wsUrl = wsUrl || (process.env.HYDRA_WS_URL as string);
    console.log(process.env.HYDRA_API_URL, process.env.HYDRA_WS_URL, this.url, this.wsUrl);
    console.log('Constructing Hydra wrangler...', this.url, this.wsUrl);
    this.BLOCKFROST_KEY = process.env.BLOCKFROST_API_KEY as string;
    this.blockfrost = new BlockfrostProvider(this.BLOCKFROST_KEY);
    this.provider = this.createHydraProvider();
    this.instance = this.createHydraInstance();
  }

  private createHydraProvider() {
    return new HydraProvider({ url: this.url, history: false });
  }

  private createHydraInstance() {
    return new HydraInstance({
      provider: this.provider,
      fetcher: this.blockfrost,
      submitter: this.provider,
    });
  }

  public async connect() {
    return await this.provider.connect();
  }

  public async startHead(txHash: string, txIndex: number) {
    this.mode = 'start';
    this.provider.onMessage(msg => this.handleIncoming(msg, { txHash, txIndex }));
    await this.provider.connect();
  }

  public async shutdownHead() {
    this.mode = 'shutdown';
    this.provider.onMessage(msg => this.handleIncoming(msg));
    await this.provider.connect();
  }

  private async doCommit(commitArgs: CommitArgs) {
    try {
      console.log(`Committing to head`, commitArgs);
      const rawTx = await this.instance.commitFunds(commitArgs.txHash, commitArgs.txIndex);
      console.log('Raw tx:', rawTx);
      return await this.blockfrost.submitTx(rawTx);
    } catch (err: any) {
      console.error(`Commit error`, err);
      return false;
    }
  }

  private async handleIncoming(
    message: any,
    commitArgs?: CommitArgs,
  ) {
    if (message.tag === 'Greetings') {
      await this.onGreetings(message.headStatus, commitArgs);
    } else {
      switch (this.mode) {
        case 'start':
          if (message.tag === 'HeadIsInitializing') {
            if (commitArgs === undefined) {
              console.error('No commit arguments specified... aborting commit!');
              return;
            }
            await this.doCommit(commitArgs);
          }
          if (message.tag === 'HeadIsOpen') {
            // Successfully started the head here... close gracefully?
          }
          break;
        case 'shutdown':
          if (message.tag === 'ReadyToFanout') {
            await this.provider.fanout();
          }
          break;
      }
    }
  }

  private async onGreetings(status: string, commitArgs?: CommitArgs) {
    switch (this.mode) {
      case 'start':
        switch (status) {
          case 'Idle':
            console.log('Idle → init()');
            await this.provider.init();
            break;
          case 'Initializing':
            console.log('Initializing -> commit()');
            if (commitArgs === undefined) {
              console.error('No commit arguments specified... aborting commit!');
              return;
            }
            await this.doCommit(commitArgs);
            break;
          case 'Open':
            console.log('Open → already ready, proceeding');
            break;
          default:
            console.log(`Greetings in start mode, ignoring status: ${status}`);
        }
        break;
      case 'shutdown':
        switch (status) {
          case 'Open':
            console.log('Shutting down: closing head…');
            await this.provider.close();
            break;
          case 'FanoutPossible':
            console.log('Fanout now possible: fanning out…');
            await this.provider.fanout();
            break;
          default:
            console.log(`Greetings in shutdown mode, ignoring status: ${status}`);
        }
    }
  }
}