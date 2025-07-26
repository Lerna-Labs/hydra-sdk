import * as dotenv from 'dotenv';
dotenv.config();

import { createMultisigAddress } from './mesh/native-script';
import { queryUtxoByAddress } from './hydra/utxo';
import { getAdmin } from './mesh/get-admin';


createMultisigAddress(
  'addr1q9sn5zrczkm0x84spn03m0rgcsu3jgmnuv2yun5xk0uy3e6qjhgqh00ctxcz0g2rgjq003afyplru706svrxgs39wkpq38c3h0',
  'stake1u9vdspzxdju5a0axnqfexlkqplvm7ynw4mk9gggxecek67qy4hcl2',
  1
);

createMultisigAddress(
  'stake1u9vdspzxdju5a0axnqfexlkqplvm7ynw4mk9gggxecek67qy4hcl2',
  'addr1q9sn5zrczkm0x84spn03m0rgcsu3jgmnuv2yun5xk0uy3e6qjhgqh00ctxcz0g2rgjq003afyplru706svrxgs39wkpq38c3h0',
  1
);


(async () => {
  const utxos = await queryUtxoByAddress('addr_test1vp7f4380zv203gjqscn5ls4j6s0v976nnqdhds5n78ty6hqu9e072');
  console.log(JSON.stringify(utxos, null, 2));

  const admin_wallet = await getAdmin();
  console.log(admin_wallet);
})();