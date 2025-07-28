import 'dotenv/config';
import express from 'express';
import { queryUtxoByAddress, createMultisigAddress, getAdmin, submitTx } from '../../src';
import { MeshWallet, TxParser } from '@meshsdk/core';
import { Client } from './protocol';
import { ArgValue } from 'tx3-sdk/trp';

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;
const TRP_URL = process.env.TRP_URL;

type initializePayload = {
  admin_wallet?: MeshWallet;
  address?: string;
  client?: Client;
}

async function initialize(user_address: string): Promise<initializePayload> {
  let admin_wallet: MeshWallet;
  try {
    admin_wallet = await getAdmin();
  } catch (error: any) {
    console.error(error);
    return {};
  }

  const { address } = createMultisigAddress(admin_wallet.addresses.enterpriseAddressBech32 as string, user_address);
  const client = new Client({
    endpoint: TRP_URL as string,
  });
  return { admin_wallet, address, client };
}

app.get('/', (_, res) => {
  res.send('Hydra SDK API is running');
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

  const { admin_wallet, address, client } = await initialize(sender_address);
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
  }

  console.log(args);


  const response = await client.sendCoinsTx(args);

  console.log(`Send Coins Tx Response`, response);

  const signedTx = await admin_wallet.signTx(response.tx);
  const submit_response = await submitTx(signedTx, reason);
  const response_json = await submit_response.json();

  console.log(`Send Coins Tx Submit Response`, response_json);
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


  const response = await client.mintCoinsTx({
    admin: ArgValue.from(admin_payment_address),
    metadataValue: ArgValue.from(Buffer.from(reason, 'utf-8')),
    quantity: ArgValue.from(quantity),
    receiver: ArgValue.from(address as string),
    mintingScript: ArgValue.from(Buffer.from('820181820400', 'hex')),
  });

  console.log(`mintCoins response`, response);

  const signedTx = await admin_wallet.signTx(response.tx);
  const submit_response = await submitTx(signedTx, reason);
  const response_json = await submit_response.json();

  console.log(response_json);

  res.json({
    status: 'SUCCESS',
    data: {
      txHash: response_json.result.hash,
    },
  });
});

app.listen(port, () => {
  console.log(`✅ Hydra SDK API server is running on http://localhost:${port}`);
});