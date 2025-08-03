import './load';

import express from 'express';
import { queryUtxoByAddress, createMultisigAddress, getAdmin, submitTx } from '../../packages/core/src';
import { Wrangler } from '../../packages/core/src/mesh/wrangler';
import { MeshWallet } from '@meshsdk/core';
import { Client } from './protocol';
import { ArgValue } from 'tx3-sdk/trp';

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;
const TRP_URL = process.env.TRP_URL as string;

type initializePayload = {
  admin_wallet?: MeshWallet;
  address?: string;
  scriptCbor?: string;
  client?: Client;
}

async function initialize(user_address?: string): Promise<initializePayload> {
  let admin_wallet: MeshWallet;
  try {
    admin_wallet = await getAdmin();
  } catch (error: any) {
    console.error(error);
    return {};
  }

  const admin_address = admin_wallet.addresses.enterpriseAddressBech32 as string;
  const client = new Client({
    endpoint: TRP_URL as string,
  });

  if (user_address === undefined) {
    return { admin_wallet, client };
  } else {
    const {
      address,
      scriptCbor,
    } = createMultisigAddress(admin_address, user_address);
    return { admin_wallet, address, scriptCbor, client };
  }
}

app.get('/', (_, res) => {
  res.send('Hydra SDK API is running');
});

app.get('/health', async (_, res) => {
  // Check the health status of the Hydra node to see if we're ready to transact or not...
  const wrangler = new Wrangler(process.env.HYDRA_WS_URL as string);
  wrangler.provider.onMessage((req: any) => {
    console.log('health check caught message:', req.tag);
    res.json({
      status: req.headStatus as string,
    });
    return;
  });
  await wrangler.connect();
  return;
});

app.post('/start', async (req, res) => {
  const wrangler = new Wrangler();
  const txHash = req.body.txHash;
  const txIndex = req.body.txIdx;
  if (!txHash) {
    console.error(`Bad Tx Hash?`, txHash);
    res.json({
      status: 'ERROR',
      message: 'Bad Commit UTxO Identifiers',
    });
    return;
  }

  if (txIndex < 0 || txIndex === undefined || txIndex === null) {
    console.error(`Bad Tx Index?`, txIndex);
    res.json({
      status: 'ERROR',
      message: 'Bad Commit UTxO Identifiers',
    });
  }


  wrangler.provider.onMessage(async (req: any) => {
    if (req.tag === 'HeadIsOpen') {
      res.json({
        status: 'SUCCESS',
        message: 'Head is open',
      });
      return;
    }
  });

  await wrangler.startHead(txHash, txIndex);
  return;
});


app.get('/utxos/:address', async (req, res) => {
  const user_address = req.params.address;
  const { admin_wallet, address } = await initialize(user_address);

  if (!admin_wallet) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize admin wallet',
    });
    return;
  }

  if (!address) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize user address',
    });
    return;
  }

  try {
    const utxos = await queryUtxoByAddress(address);
    res.json({
      status: 'SUCCESS',
      data: {
        address,
        utxos,
      },
    });
  } catch (error: any) {
    res.json({
      status: 'ERROR',
      message: 'Failed to query UTxO',
    });
  }
});

app.post('/send', async (req, res) => {
  const sender_address = req.body.sender;
  const receiver_address = req.body.receiver;
  const quantity = req.body.quantity;
  const reason = req.body.reason;
  const signature = req.body.signature;

  const { admin_wallet, address, scriptCbor, client } = await initialize(sender_address);
  if (!admin_wallet) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize admin wallet',
    });
    return;
  }

  if (!address) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize user address',
    });
    return;
  }

  if (!client) {
    res.json({
      status: 'ERROR',
      message: 'Could not start the TRP client!',
    });
    return;
  }

  const args = {
    quantity: ArgValue.from(quantity),
    reason: ArgValue.from(Buffer.from(reason, 'utf-8')),
    sender: ArgValue.from(address),
    receiver: ArgValue.from(receiver_address),
    userSignature: ArgValue.from(Buffer.from(signature, 'hex')),
    userScript: ArgValue.from(Buffer.from(scriptCbor as string, 'hex')),
  };

  console.log(args);


  const response = await client.sendCoinsTx(args);

  console.log(`Send Coins Tx Response`, response);

  const signedTx = await admin_wallet.signTx(response.tx);
  const submit_response = await submitTx(TRP_URL, signedTx, reason);
  const response_json = await submit_response.json();
  console.log(`Send Coins Tx Submit Response`, response_json);

  if (response_json.error) {
    res.json({
      status: 'ERROR',
      message: response_json.error.message,
    });
    return;
  }

  res.json({
    status: 'SUCCESS',
    data: {
      txHash: response_json.result.hash,
    },
  });
});

app.post('/sendAll', async (req, res) => {
  const sender_address = req.body.sender;

  const { admin_wallet, address, scriptCbor, client } = await initialize(sender_address);
  if (!admin_wallet) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize admin wallet',
    });
    return;
  }

  if (!address) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize user address',
    });
    return;
  }

  if (!client) {
    res.json({
      status: 'ERROR',
      message: 'Could not start the TRP client!',
    });
    return;
  }

  const args = {
    sender: ArgValue.from(address),
  };

  console.log(args);


  const response = await client.sendAllTx(args);

  console.log(`Send All Tx Response`, response);

  const signedTx = await admin_wallet.signTx(response.tx);
  const submit_response = await submitTx(TRP_URL, signedTx, 'cleanuputxo');
  const response_json = await submit_response.json();
  console.log(`Send All Tx Submit Response`, response_json);

  if (response_json.error) {
    res.json({
      status: 'ERROR',
      message: response_json.error.message,
    });
    return;
  }

  res.json({
    status: 'SUCCESS',
    data: {
      txHash: response_json.result.hash,
    },
  });
});

app.post('/reward', async (req, res) => {
  const user_address = req.body.address;
  const reason = req.body.reason;
  const quantity = req.body.quantity;

  const { admin_wallet, address, client } = await initialize(user_address);

  if (!admin_wallet) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize admin wallet',
    });
    return;
  }

  const admin_payment_address = admin_wallet.addresses.enterpriseAddressBech32 as string;

  if (!address) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize user address',
    });
    return;
  }

  if (!client) {
    res.json({
      status: 'ERROR',
      message: 'Could not start the TRP client!',
    });
    return;
  }

  console.log(`Attempting to issue ${quantity} rewards from ${admin_payment_address} to ${address} for: ${reason}`);

  const response = await client.mintCoinsTx({
    admin: ArgValue.from(admin_payment_address),
    metadataValue: ArgValue.from(Buffer.from(reason, 'utf-8')),
    quantity: ArgValue.from(quantity),
    receiver: ArgValue.from(address as string),
    mintingScript: ArgValue.from(Buffer.from('820181820400', 'hex')),
  });

  console.log(`mintCoins response`, response);

  const signedTx = await admin_wallet.signTx(response.tx);
  const submit_response = await submitTx(TRP_URL, signedTx, reason);
  const response_json = await submit_response.json();

  console.log(response_json);

  res.json({
    status: 'SUCCESS',
    data: {
      txHash: response_json.result.hash,
    },
  });
});

app.post('/burn', async (req, res) => {
  const quantity = req.body.quantity;

  const { admin_wallet, client } = await initialize();

  if (!admin_wallet) {
    res.json({
      status: 'ERROR',
      message: 'Could not initialize admin wallet',
    });
    return;
  }

  if (!client) {
    res.json({
      status: 'ERROR',
      message: 'Could not start the TRP client!',
    });
    return;
  }

  console.log(`Attempting to burn ${quantity} from ${admin_wallet.addresses.enterpriseAddressBech32}`);

  try {
    const response = await client.burnCoinsTx({
      admin: ArgValue.from(admin_wallet.addresses.enterpriseAddressBech32 as string),
      quantity: ArgValue.from(quantity),
      mintingScript: ArgValue.from(Buffer.from('820181820400', 'hex')),
    });
    console.log(`burnCoins response`, response);
    const signedTx = await admin_wallet.signTx(response.tx);
    const submit_response = await submitTx(TRP_URL, signedTx, 'burnbabyburn');
    const response_json = await submit_response.json();
    if (response_json.result.hash) {
      res.json({
        status: 'SUCCESS',
        data: {
          txHash: response_json.result.hash,
        },
      });
    } else {
      console.error(`No result hash?`, response_json);
      res.json({
        status: 'ERROR',
        message: 'Could not create burn transaction, please try again',
      });
    }
  } catch (e: any) {
    console.error(`Could not resolve burn tx:`, e);
    res.json({
      status: 'ERROR',
      message: 'Could not create burn transaction, please try again',
    });
    return;
  }

});

app.listen(port, () => {
  console.log(`✅ Hydra SDK API server is running on http://localhost:${port}`);
});
