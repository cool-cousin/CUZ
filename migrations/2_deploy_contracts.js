const CUZTokenSale = artifacts.require("CUZTokenSale");
const CUZCrowdsaleTokenVesting = artifacts.require("CUZCrowdsaleTokenVesting");
const CUZBAETokenVesting = artifacts.require("CUZBAETokenVesting");
const CUZFutureDevelopmentWallet = artifacts.require("CUZFutureDevelopmentWallet");
const CUZTeamTokenVesting = artifacts.require("CUZTeamTokenVesting");
const CUZTeamReserveTokenVesting = artifacts.require('CUZTeamReserveTokenVesting');
const CUZ = artifacts.require('CUZ');

module.exports = function(deployer, network, accounts) {
	const wallet = accounts[0];
  const presaleStartTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 3600; // one hour in the future
	const startTime = presaleStartTime + 86400 * 7; // one week after presale start
  const endTime = startTime + (86400 * 30 * 3);

 deployer
   .then(async function () {
    await deployer.deploy(CUZBAETokenVesting, endTime);
    const baeTokenVesting = await CUZBAETokenVesting.deployed();

    await deployer.deploy(CUZTeamTokenVesting, endTime);
    const teamTokenVesting = await CUZTeamTokenVesting.deployed();

    await deployer.deploy(CUZTeamReserveTokenVesting, endTime);
    const teamReserveTokenVesting = await CUZTeamReserveTokenVesting.deployed();

    await deployer.deploy(CUZFutureDevelopmentWallet, endTime);
    const futureDevelopmentWallet = await CUZFutureDevelopmentWallet.deployed();

    await deployer.deploy(CUZ, baeTokenVesting.address, teamTokenVesting.address, teamReserveTokenVesting.address, futureDevelopmentWallet.address);
    const token = await CUZ.deployed();

    await baeTokenVesting.setToken.sendTransaction(token.address);
    await teamTokenVesting.setToken.sendTransaction(token.address);
    await teamReserveTokenVesting.setToken.sendTransaction(token.address);
    await futureDevelopmentWallet.setToken.sendTransaction(token.address);

    await deployer.deploy(CUZCrowdsaleTokenVesting, token.address, {gas: 100000000});
    const tokenVesting = await CUZCrowdsaleTokenVesting.deployed();

    await deployer.deploy(CUZTokenSale, presaleStartTime, startTime, endTime, token.address, tokenVesting.address, wallet, {gas: 100000000});
    const tokenSale = await CUZTokenSale.deployed();

    await token.transferOwnership.sendTransaction(tokenSale.address, {from: wallet});
    await tokenVesting.transferOwnership.sendTransaction(tokenSale.address, {from: wallet});
  });
};
