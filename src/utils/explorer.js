const axios = require('axios');
const config = require('../config');

async function getTransactionStatus(networkName, txHash) {
  const network = config.networks[networkName];
  if (!network.explorerApi) return null;

  const url = networkName === 'bsc' 
    ? `https://api.bscscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${network.explorerApi}`
    : `https://api.polygonscan.com/api?module=transaction&action=gettxreceiptstatus&txhash=${txHash}&apikey=${network.explorerApi}`;

  try {
    const response = await axios.get(url);
    if (response.data.status === '1') {
      return response.data.result.status === '1' ? 'success' : 'failed';
    }
    return 'pending';
  } catch (error) {
    console.error(`[Explorer] Error fetching tx status:`, error.message);
    return null;
  }
}

async function getPolygonGasPrice() {
  try {
    // Polygon Gas Station is often more reliable than RPC for Polygon
    const response = await axios.get('https://gasstation.polygon.technology/v2');
    return {
      maxPriorityFee: response.data.fast.maxPriorityFee,
      maxFee: response.data.fast.maxFee
    };
  } catch (error) {
    console.warn(`[Explorer] Error fetching Polygon gas:`, error.message);
    return null;
  }
}

function getExplorerLink(networkName, txHash) {
  const network = config.networks[networkName];
  return `${network.explorerUrl}/tx/${txHash}`;
}

module.exports = {
  getTransactionStatus,
  getPolygonGasPrice,
  getExplorerLink
};
