'use strict';

const {duration} = require('../zeppelin-solidity/test/helpers/increaseTime');

const CUZ = artifacts.require('./CUZ.sol');
const CUZTokenSale = artifacts.require('./CUZTokenSale.sol');
const CUZCrowdsaleTokenVesting = artifacts.require('./CUZCrowdsaleTokenVesting.sol');
const CUZCrowdsaleTokenLiquidizer = artifacts.require('./CUZCrowdsaleTokenLiquidizer.sol');

Promise = require('bluebird');

module.exports = function(deployer, network, accounts) {
	deployer.then(async () => {
		const {timestamp} = await Promise.promisify(web3.eth.getBlock, {context: web3.eth})('latest');
		const cuz = await CUZ.deployed();

		await deployer.deploy(CUZCrowdsaleTokenVesting, cuz.address);
		const crowdsaleTokenVesting = await CUZCrowdsaleTokenVesting.deployed();

		await deployer.deploy(CUZCrowdsaleTokenLiquidizer, cuz.address);
		const crowdsaleTokenLiquidizer = await CUZCrowdsaleTokenLiquidizer.deployed();

		const presaleStartTime = timestamp + duration.minutes(10);  // start presale 10 minutes from now
		const startTime = presaleStartTime + duration.days(1) + duration.days(7);  // start public crowdsale one week after presale end
		const endTime = startTime + duration.days(7);  // public crowdsale goes on for one week
		const privateSaleWeiRaised = 15000 * 10 ** 18;
		
		await deployer.deploy(
			CUZTokenSale,
			presaleStartTime,
			startTime,
			endTime,
			privateSaleWeiRaised,
			cuz.address,
			crowdsaleTokenLiquidizer.address,
			crowdsaleTokenVesting.address,
			accounts[0]
		);

		const tokenSale = await CUZTokenSale.deployed();

		await Promise.each(
			[cuz, crowdsaleTokenVesting],
			instance =>
				instance.transferOwnership(tokenSale.address)
		);
	});
};
