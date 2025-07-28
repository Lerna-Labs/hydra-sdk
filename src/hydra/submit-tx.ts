const TRP_URL = process.env.TRP_URL;

export async function submitTx(payload: string, id: string): Promise<Response> {
  return await fetch(TRP_URL as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'trp.submit',
      params: {
        tx: {
          payload,
          encoding: 'hex',
          version: 'v1alpha6',
        },
      },
      id,
    }),
  });
}