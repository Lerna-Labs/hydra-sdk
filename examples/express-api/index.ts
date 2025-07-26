import 'dotenv/config';
import express from 'express';
import { queryUtxoByAddress, createMultisigAddress, getAdmin } from '../../src';
import { MeshWallet } from '@meshsdk/core';
import { Client } from './protocol';
import { ArgValue } from 'tx3-sdk/trp';

const app = express();
app.use(express.json());
const port = process.env.PORT || 3000;
const TRP_URL = process.env.TRP_URL;

app.get('/', (_, res) => {
  res.send('Hydra SDK API is running');
});

app.get('/utxos/:address', async (req, res) => {
  const user_address = req.params.address;
  let admin_address: MeshWallet;
  try {
    admin_address = await getAdmin();
  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      error: 'Could not initialize',
      details: error.message,
    });
    return;
  }

  const { address } = createMultisigAddress(admin_address.addresses.enterpriseAddressBech32 as string, user_address);

  try {
    const utxos = await queryUtxoByAddress(address);
    res.json({ address, utxos });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to query UTxOs',
      details: error.message,
    });
  }
});

app.post('/reward', async (req, res) => {
  const user_address = req.body.address;
  const reason = req.body.reason;
  const quantity = req.body.quantity;

  let admin_address: MeshWallet;
  try {
    admin_address = await getAdmin();

  } catch (error: any) {
    console.error(error);
    res.status(500).json({
      error: 'Could not initialize',
      details: error.message,
    });
    return;
  }

  const { address } = createMultisigAddress(admin_address.addresses.enterpriseAddressBech32 as string, user_address);
  const client = new Client({
    endpoint: TRP_URL as string,
  });

  const response = await client.mintCoinsTx({
    admin: ArgValue.from(admin_address.addresses.enterpriseAddressBech32 as string),
    metadataValue: ArgValue.from(Buffer.from(reason, 'utf-8')),
    quantity: ArgValue.from(quantity),
    receiver: ArgValue.from(address as string),
    mintingScript: ArgValue.from(Buffer.from('820181820400', 'hex')),
  });


  console.log(`mintCoins response`, response);

  const signedTx = await admin_address.signTx(response.tx);
  const submit_response = await fetch(TRP_URL as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'trp.submit',
      params: {
        tx: {
          payload: signedTx,
          encoding: 'hex',
          version: 'v1alpha6',
        },
      },
      id: reason,
    }),
  });

  const response_json = await submit_response.json();

  console.log(response_json);


  res.json({
    status: 'SUCCESS',
    message: response_json.result.hash,
  });
});

app.listen(port, () => {
  console.log(`✅ Hydra SDK API server is running on http://localhost:${port}`);
});