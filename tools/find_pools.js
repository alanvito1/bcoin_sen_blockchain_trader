const axios = require('axios');

async function findPool(network, token) {
  const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${token}/pools`;
  try {
    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json;version=20230203' }
    });
    const pools = response.data.data;
    if (pools && pools.length > 0) {
      // Sort by reserve in USD or volume if possible? 
      // For now pick the first one which is usually the most popular.
      const bestPool = pools[0];
      console.log(`${network} ${token}: ${bestPool.id} (${bestPool.attributes.name})`);
    } else {
      console.log(`${network} ${token}: No pools found`);
    }
  } catch (error) {
    console.error(`${network} ${token}: Error ${error.message}`);
  }
}

async function main() {
  const tokens = [
    { network: 'bsc', address: '0x00e1656e45f18ec6747f5a8496fd39b50b38396d' }, // BCOIN BSC
    { network: 'bsc', address: '0xb43ac9a81eda5a5b36839d5b6fc65606815361b0' }, // SEN BSC
    { network: 'polygon', address: '0xb2c63830d4478cb331142fac075a39671a5541dc' }, // BCOIN Polygon
    { network: 'polygon', address: '0xfe302b8666539d5046cd9aa0707bb327f5f94c22' }  // SEN Polygon
  ];

  for (const t of tokens) {
    await findPool(t.network, t.address);
    // Sleep a bit to respect rate limits
    await new Promise(r => setTimeout(r, 2000));
  }
}

main();
