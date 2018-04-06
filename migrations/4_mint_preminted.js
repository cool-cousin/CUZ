'use strict';

const {duration} = require('../zeppelin-solidity/test/helpers/increaseTime');

const CUZ = artifacts.require('./CUZ.sol');
const CUZBAETokenVesting = artifacts.require('./CUZBAETokenVesting.sol');
const CUZTeamTokenVesting = artifacts.require('./CUZTeamTokenVesting.sol');
const CUZTeamReserveTokenVesting = artifacts.require('./CUZTeamReserveTokenVesting.sol');
const CUZFutureDevelopmentWallet = artifacts.require('./CUZFutureDevelopmentWallet.sol');

Promise = require('bluebird');

module.exports = function(deployer, network, accounts) {
	let cuz;
	let endTime;

	deployer.then(() =>
		Promise.promisify(web3.eth.getBlock, {context: web3.eth})('latest')
	).then(({timestamp}) => {
		endTime = new web3.BigNumber(timestamp).add(duration.days(30))
	}).then(() =>
		deployer.then(() =>
			deployer.deploy(CUZBAETokenVesting, endTime)
		).then(() =>
			deployer.deploy(CUZTeamTokenVesting, endTime)
		).then(() =>
			deployer.deploy(CUZTeamReserveTokenVesting, endTime)
		).then(() =>
			deployer.deploy(CUZFutureDevelopmentWallet, endTime)
		).then(() =>
			CUZ.deployed()
		).then(instance => {
			cuz = instance;
		}).then(() =>
			CUZBAETokenVesting.at(CUZBAETokenVesting.address).setToken(cuz.address)
		).then(() =>
			CUZTeamTokenVesting.at(CUZTeamTokenVesting.address).setToken(cuz.address)
		).then(() =>
			CUZTeamReserveTokenVesting.at(CUZTeamReserveTokenVesting.address).setToken(cuz.address)
		).then(() =>
			CUZFutureDevelopmentWallet.at(CUZFutureDevelopmentWallet.address).setToken(cuz.address)
		).then(() =>
			cuz.mint(CUZBAETokenVesting.address, 300000000 * (9.33 / 100) * 10 ** 18, {from: accounts[0]})
		).then(() =>
			cuz.mint(CUZTeamTokenVesting.address, 300000000 * (6.5 / 100) * 10 ** 18, {from: accounts[0]})
		).then(() =>
			cuz.mint(CUZTeamReserveTokenVesting.address, 300000000 * (3.5 / 100) * 10 ** 18, {from: accounts[0]})
		).then(() =>
			cuz.mint(CUZFutureDevelopmentWallet.address, 300000000 * (22 / 100) * 10 ** 18, {from: accounts[0]})
		).then(() =>
			cuz.mint(
				accounts[0],
				(
					//(300000000 * (0.67 / 100) * 10 ** 18) +  // bounty funds (!!pre-minted!!)
					(300000000 * (21 / 100) * 10 ** 18) +  // community funds
					(300000000 * (4 / 100) * 10 ** 18)  // future funds - liquidated portion,
				),
	      		{from: accounts[0]})
		)
	);
};
