const axios = require('axios');

async function getPool(network, token) {
  try {
    const r = await axios.get(`https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${token}/pools`);
    const pool = r.data.data[0];
    if (pool) {
      console.log(`${network.toUpperCase()} ${token}: ${pool.id} (${pool.attributes.name})`);
    } else {
      console.log(`${network.toUpperCase()} ${token}: Not found`);
    }
  } catch (e) {
    console.error(`${network.toUpperCase()} ${token}: Error ${e.message}`);
  }
}

async function main() {
  await getPool('bsc', '0x00e1656e45f18ec6747f5a8496fd39b50b38396d');
  await new Promise(r => setTimeout(r, 2000));
  await getPool('bsc', '0xb43ac9a81eda5a5b36839d5b6fc65606815361b0');
  await new Promise(r => setTimeout(r, 2000));
  await getPool('polygon', '0xb2c63830d4478cb331142fac075a39671a5541dc');
  await new Promise(r => setTimeout(r, 2000));
  await getPool('polygon', '0xfe302b8666539d5046cd9aa0707bb327f5f94c22');
}

main();
