var CUZ = artifacts.require("./CUZ.sol");

module.exports = function(deployer, network, accounts) {
	deployer.deploy([]).then(() =>
		CUZ.deployed()
	).then(cuz =>
		cuz.mint(accounts[0], 2010000 * 10 ** 18, {from: accounts[0]})
	)
};
