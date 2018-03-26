const CUZTokenSale = artifacts.require("CUZTokenSale");
const CUZCrowdsaleTokenVesting = artifacts.require("CUZCrowdsaleTokenVesting");
const CUZTeamTokenVesting = artifacts.require("CUZTeamTokenVesting");
const CUZBAETokenVesting = artifacts.require("CUZTeamTokenVesting");
const CUZFutureDevelopmentWallet = artifacts.require('CUZFutureDevelopmentWallet');
const CUZTeamReserveTokenVesting = artifacts.require('CUZTeamReserveTokenVesting');
const CUZ = artifacts.require("CUZ");

import EVMRevert from '../zeppelin-solidity/test/helpers/EVMRevert';
import latestTime from '../zeppelin-solidity/test/helpers/latestTime';
import { increaseTimeTo, duration } from '../zeppelin-solidity/test/helpers/increaseTime';
import Deployer from 'truffle-deployer';
import Ganache from 'ganache-core';
import Promise from 'bluebird';
import _ from 'lodash';

const BigNumber = web3.BigNumber;

async function assertTokenBalance(token, address, expected) {
  const actual = await token.balanceOf(address);
  actual.div(1e18).should.bignumber.equal(expected);
};

async function assertVestedBalance(tokenVesting, address, expected) {
  const actual = await tokenVesting.vestedAmount(address);
  actual.div(1e18).should.bignumber.equal(expected);
}

require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .use(require('chai-as-promised'))
  .should();

function $beforeEach(accounts) {
  return async function () {
    this.presaleStartTime = (new BigNumber(latestTime())).add(duration.hours(1));
    this.startTime = this.presaleStartTime.add(duration.weeks(2)); // two weeks of public pre-sale
    const endTime = this.endTime = this.startTime.add(duration.weeks(4)); // 4 weeks of public sale

    const baeTokenVesting = this.baeTokenVesting = await CUZBAETokenVesting.new(endTime);
    const teamTokenVesting = this.teamTokenVesting = await CUZTeamTokenVesting.new(endTime);
    const teamReserveTokenVesting = this.teamReserveTokenVesting = await CUZTeamReserveTokenVesting.new(endTime);
    const futureDevelopmentWallet = this.futureDevelopmentWallet = await CUZFutureDevelopmentWallet.new(endTime);

    const token = this.token = await CUZ.new(
      {
        gas: 40000000000
      }
    );

    await baeTokenVesting.setToken.sendTransaction(token.address);
    await teamTokenVesting.setToken.sendTransaction(token.address);
    await teamReserveTokenVesting.setToken.sendTransaction(token.address);
    await futureDevelopmentWallet.setToken.sendTransaction(token.address);

    await token.mint.sendTransaction(baeTokenVesting.address, 300000000 * (7.33 / 100) * 10 ** 18);
    await token.mint.sendTransaction(teamTokenVesting.address, 300000000 * (6.5 / 100) * 10 ** 18);
    await token.mint.sendTransaction(teamReserveTokenVesting.address, 300000000 * (3.5 / 100) * 10 ** 18);
    await token.mint.sendTransaction(futureDevelopmentWallet.address, 300000000 * (21 / 100) * 10 ** 18);

    await token.mint.sendTransaction(accounts[0], (
      (300000000 * (0.67 / 100) * 10 ** 18) +  // bounty funds
      (300000000 * (25 / 100) * 10 ** 18) +  // community funds
      (300000000 * (3 / 100) * 10 ** 18)  // future funds - liquidated portion
    ))

    const tokenVesting = this.tokenVesting = await CUZCrowdsaleTokenVesting.new(token.address, {gas: 4000000});
    const tokenSale = this.tokenSale = await CUZTokenSale.new(
      this.presaleStartTime, this.startTime, this.endTime, web3.toWei(1000, 'ether'), token.address, tokenVesting.address, accounts[0], {gas: 4000000}
    );

    await token.transferOwnership.sendTransaction(tokenSale.address);
    await tokenVesting.transferOwnership.sendTransaction(tokenSale.address);

    this.assertTokenBalance = (address, expected) => assertTokenBalance(token, address, expected);
    this.assertVestedBalance = (address, expected) => assertVestedBalance(tokenVesting, address, expected);

    this.invest = async (address, etherAmount, {shouldFail = false, setWhitelist = true} = {}) => {
      const weiAmount = web3.toWei(etherAmount, 'ether');

      if (setWhitelist) {
        await this.tokenSale.setWhitelistedAmount.sendTransaction(address, weiAmount);
      }

      try {
        await web3.eth.sendTransaction({
          from: address,
          to: this.tokenSale.address,
          value: weiAmount,
          gas: 4000000
        });
      } catch (e) {
        if (e.message.indexOf('revert') !== -1 && shouldFail) {
          return;
        } else {
          throw e;
        }
      }

      if (shouldFail) {
        throw new Error('Transaction should have failed.');
      }
    };

    this.fastForwardToAfterPresaleStart = async (duration_ = 0) => {
      await increaseTimeTo((await this.tokenSale.presaleStartTime()).add(duration_));
    }

    this.fastForwardToAfterCrowdsaleStart = async (duration_ = 0) => {
      await increaseTimeTo((await this.tokenSale.startTime()).add(duration_));
    }

    this.fastForwardToAfterCrowdsaleEnd = async (duration_ = 0) => {
      await increaseTimeTo((await this.tokenSale.endTime()).add(duration_));
    }
  }
}

contract('CUZTeamTokenVesting', function(accounts) {
  beforeEach($beforeEach(accounts));

  it("check cannot retrieve funds before vesting period is over", async function () {
    await this.fastForwardToAfterCrowdsaleEnd(duration.days(365 * 2 - 1));

    const oldOwnerBalance = (await this.token.balanceOf(accounts[0])).div(1e18);
    
    await this.teamTokenVesting.transferReleasedVestedFunds.sendTransaction().should.be.rejectedWith(EVMRevert);

    await this.assertTokenBalance(accounts[0], oldOwnerBalance);
  });

  it("check retrieve funds after vesting period is over", async function () {
    const oldOwnerBalance = (await this.token.balanceOf(accounts[0])).div(1e18);
    const tokenAmount = (await this.token.balanceOf(this.teamTokenVesting.address)).div(1e18);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(365 * 2) + duration.hours(1));
    
    await this.teamTokenVesting.transferReleasedVestedFunds.sendTransaction();

    await this.assertTokenBalance(accounts[0], oldOwnerBalance.add(tokenAmount));
  });

  it("fail to invest with less than minimum eth", async function() {
    const investor = accounts[2];

    await this.fastForwardToAfterCrowdsaleStart(duration.hours(1));
    await this.invest(investor, 0.05, {shouldFail: true});
    await this.assertVestedBalance(investor, 0);
    await this.assertTokenBalance(investor, 0);
  });

  it('[sale] get 20% bonus in first 24 hours', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterCrowdsaleStart(duration.hours(1));
    await this.invest(investor1, 1);
    await this.fastForwardToAfterCrowdsaleStart(duration.hours(23));
    await this.invest(investor2, 2);

    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 7540);

    await this.assertVestedBalance(investor1, 754);
    await this.assertVestedBalance(investor2, 1508);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 3 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 4000000});
    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 7540);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 3))
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 4524);
    await this.assertTokenBalance(investor2, 9048);
  });

  it('[sale] get 10% bonus in days 2-7', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterCrowdsaleStart(duration.days(1));
    await this.invest(investor1, 1);
    await this.fastForwardToAfterCrowdsaleStart(duration.days(6));
    await this.invest(investor2, 2);

    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 7540);

    await this.assertVestedBalance(investor1, 377);
    await this.assertVestedBalance(investor2, 754);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 1.5 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 7540);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 1.5));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 4147);
    await this.assertTokenBalance(investor2, 8294);
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
  });

  it('[sale] get 5% bonus in week 2', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterCrowdsaleStart(duration.days(7));

    await this.invest(investor1, 1);
    await this.invest(investor2, 2);

    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 7540);

    await this.assertVestedBalance(investor1, 188.5);
    await this.assertVestedBalance(investor2, 377);

    // try to withdraw before vesting
    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 7540);

    // (successfuly) try to withdraw after vesting
    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 3958.5);
    await this.assertTokenBalance(investor2, 7917);
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
  });

  it('[presale] get 20% bonus on 0.1-10 eth', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 1);
    await this.invest(investor2, 10);

    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 37700);

    await this.assertVestedBalance(investor1, 754);
    await this.assertVestedBalance(investor2, 7540);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 3 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 3770);
    await this.assertTokenBalance(investor2, 37700);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 3 + 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 4524);
    await this.assertTokenBalance(investor2, 45240);
  });

  it('[presale] get 25% bonus on >10-50 eth', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 15);
    await this.invest(investor2, 50);

    await this.assertTokenBalance(investor1, 56550);
    await this.assertTokenBalance(investor2, 188500);

    await this.assertVestedBalance(investor1, 14137.5);
    await this.assertVestedBalance(investor2, 47125);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 3 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 56550);
    await this.assertTokenBalance(investor2, 188500);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 3 + 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
    await this.assertTokenBalance(investor1, 70687.5);
    await this.assertTokenBalance(investor2, 235625);
  });

  it('[presale] get 30% bonus on >50-100 eth', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 55);
    await this.invest(investor2, 100);

    await this.assertTokenBalance(investor1, 55 * 3770);
    await this.assertTokenBalance(investor2, 100 * 3770);

    await this.assertVestedBalance(investor1, 55 * 3770 * 0.3);
    await this.assertVestedBalance(investor2, 100 * 3770 * 0.3);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 6 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 55 * 3770);
    await this.assertTokenBalance(investor2, 100 * 3770);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 6 + 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
    await this.assertTokenBalance(investor1, 55 * 3770 * 1.3);
    await this.assertTokenBalance(investor2, 100 * 3770 * 1.3);
  });

  it('[presale] get 35% bonus on >100-250 eth', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 110);
    await this.invest(investor2, 250);

    await this.assertTokenBalance(investor1, 110 * 3770);
    await this.assertTokenBalance(investor2, 250 * 3770);

    await this.assertVestedBalance(investor1, 110 * 3770 * 0.35);
    await this.assertVestedBalance(investor2, 250 * 3770 * 0.35);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 6 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 110 * 3770);
    await this.assertTokenBalance(investor2, 250 * 3770);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 6 + 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
    await this.assertTokenBalance(investor1, 110 * 3770 * 1.35);
    await this.assertTokenBalance(investor2, 250 * 3770 * 1.35);
  });

  it('[presale] get 40% bonus on >250-500 eth', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 255);
    await this.invest(investor2, 500);

    await this.assertTokenBalance(investor1, 255 * 3770);
    await this.assertTokenBalance(investor2, 500 * 3770);

    await this.assertVestedBalance(investor1, 255 * 3770 * 0.4);
    await this.assertVestedBalance(investor2, 500 * 3770 * 0.4);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 9 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 255 * 3770);
    await this.assertTokenBalance(investor2, 500 * 3770);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 9 + 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
    await this.assertTokenBalance(investor1, 255 * 3770 * 1.4);
    await this.assertTokenBalance(investor2, 500 * 3770 * 1.4);
  });

  it('[presale] get 50% bonus on >500 eth', async function() {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 510);
    await this.invest(investor2, 550);

    await this.assertTokenBalance(investor1, 510 * 3770);
    await this.assertTokenBalance(investor2, 550 * 3770);

    await this.assertVestedBalance(investor1, 510 * 3770 * 0.5);
    await this.assertVestedBalance(investor2, 550 * 3770 * 0.5);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 9 - 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertTokenBalance(investor1, 510 * 3770);
    await this.assertTokenBalance(investor2, 550 * 3770);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(30 * 9 + 1));
    await this.tokenVesting.transferReleasedVestedFunds.sendTransaction({gas: 300000});
    await this.assertVestedBalance(investor1, 0);
    await this.assertVestedBalance(investor2, 0);
    await this.assertTokenBalance(investor1, 510 * 3770 * 1.5);
    await this.assertTokenBalance(investor2, 550 * 3770 * 1.5);
  });

  it(`can't invest more than maximum for first 3 hours`, async function() {
    const investor = accounts[2];

    await this.fastForwardToAfterPresaleStart(duration.minutes(15));
    await this.invest(investor, 5, {shouldFail: true});
    await this.invest(investor, 2);
    await this.invest(investor, 3, {shouldFail: true});

    await this.assertTokenBalance(investor, 2 * 3770);
    await this.assertVestedBalance(investor, 2 * 3770 * 0.2);
  });

  it('buy whole supply', async function() {
    const investor = accounts[4];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor, 16500);
    await this.assertTokenBalance(investor, 16500 * 3770);
  });

  it("can't invest after eth cap has been reached", async function() {
    const investor1 = accounts[4], investor2 = accounts[5];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 16500);

    await this.invest(investor2, 1, {shouldFail: true});

    await this.tokenSale.hasEnded().should.eventually.be.true;
    await this.assertTokenBalance(investor2, 0);
    await this.assertVestedBalance(investor2, 0);
  });

  it("can't invest after crowdsale has ended", async function() {
    const investor1 = accounts[4], investor2 = accounts[5];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 1);
    await this.tokenSale.hasEnded().should.eventually.be.false;

    await this.fastForwardToAfterCrowdsaleEnd(duration.hours(1));
    await this.invest(investor2, 1, {shouldFail: true});

    await this.tokenSale.hasEnded().should.eventually.be.true;
    await this.assertTokenBalance(investor2, 0);
    await this.assertVestedBalance(investor2, 0);
  });

  it("can't buy more than supply left", async function() {
    const investor1 = accounts[4], investor2 = accounts[5];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 10000);
    await this.invest(investor1, 6000);

    await this.assertTokenBalance(investor1, 16000 * 3770);

    await this.invest(investor2, 501, {shouldFail: true});
    await this.assertTokenBalance(investor2, 0);
  });

  it("can't buy if not whitelisted", async function () {
    const investor = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor, 1, {setWhitelist: false, shouldFail: true});
    await this.assertTokenBalance(investor, 0);
    await this.assertVestedBalance(investor, 0);
  });

  it("can't buy more than whitelisted amount", async function () {
    const investor = accounts[3];

    await this.tokenSale.setWhitelistedAmount.sendTransaction(investor, 1 * 10 ** 18);

    await this.fastForwardToAfterPresaleStart(duration.hours(12));

    await this.tokenSale.setWhitelistedAmount.sendTransaction(investor, web3.toWei(1, 'ether'));

    await this.invest(investor, 1.5, {setWhitelist: false, shouldFail: true});
    await this.assertTokenBalance(investor, 0);
    await this.assertVestedBalance(investor, 0);

    await this.invest(investor, 1, {setWhitelist: false, shouldFail: false});
    await this.assertTokenBalance(investor, 1 * 3770);
    await this.assertVestedBalance(investor, 1 * 0.2 * 3770);
  });

  it("test whitelisted amount is depleted", async function () {
    const investor = accounts[3];

    await this.tokenSale.setWhitelistedAmount.sendTransaction(investor, 1 * 10 ** 18);

    await this.fastForwardToAfterPresaleStart(duration.hours(12));

    await this.tokenSale.setWhitelistedAmount.sendTransaction(investor, web3.toWei(1, 'ether'));

    await this.invest(investor, 1.0, {setWhitelist: false, shouldFail: false});
    await this.assertTokenBalance(investor, 1 * 3770);
    await this.assertVestedBalance(investor, 1 * 0.2 * 3770);

    await this.invest(investor, 1.0, {setWhitelist: false, shouldFail: true});
    await this.assertTokenBalance(investor, 1 * 3770);
    await this.assertVestedBalance(investor, 1 * 0.2 * 3770);
  });

  it("check team allocation", async function () {
    const teamAddress = this.teamTokenVesting.address;

    await this.assertTokenBalance(teamAddress, 300000000 * (6.5 / 100));
  });

  it("transfer coins between 2 accounts", async function () {
    const investor1 = accounts[2], investor2 = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 15);

    await this.token.transfer.sendTransaction(investor2, 100 * 10 ** 18, {from: investor1})
    await this.assertTokenBalance(investor2, 100)
  });

  it('test release unsold tokens', async function () {
    const investor1 = accounts[3], investor2 = accounts[4];

    const oldOwnerBalance = (await this.token.balanceOf(accounts[0])).div(1e18);

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.invest(investor1, 1000);
    await this.assertTokenBalance(investor1, 1000 * 3770);
    await this.assertVestedBalance(investor1, 1000 * 3770 * 0.5);

    await this.fastForwardToAfterCrowdsaleStart(duration.hours(1));
    await this.invest(investor2, 2000);
    await this.assertTokenBalance(investor2, 2000 * 3770);
    await this.assertVestedBalance(investor2, 2000 * 3770 * 0.2);

    const tokensLeft = (await this.token.cap()).sub(await this.token.totalSupply());
    const companyTokens = tokensLeft.mul(0.67);
    const crowdTokens = tokensLeft.sub(companyTokens);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(1));
    await this.tokenSale.releaseUnsoldTokens.sendTransaction();

    await this.assertTokenBalance(accounts[0], oldOwnerBalance.add(companyTokens.div(1e18)).add(crowdTokens.div(1e18).div(4)));
    await this.assertTokenBalance(investor1, (new BigNumber(1000 * 3770)).add((crowdTokens.div(4)).div(1e18)));
    await this.assertTokenBalance(investor2, (await this.token.balanceOf(investor1)).mul(2).div(1e18));
  });

  it('test transfer ownership of token back to owner after crowdsale period end', async function () {
    const owner = accounts[0];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));
    await this.tokenSale.finalize().should.be.rejectedWith(EVMRevert);

    await this.fastForwardToAfterCrowdsaleEnd(duration.hours(1));
    await this.tokenSale.finalize();

    assert (await this.token.owner()) == owner;
  });

  it('test transfer ownership of token back to owner after cap reached', async function () {
    const owner = accounts[0];
    const investor = accounts[3];

    await this.fastForwardToAfterPresaleStart(duration.hours(12));

    await this.tokenSale.finalize().should.be.rejectedWith(EVMRevert);

    await this.invest(investor, 10000);
    await this.tokenSale.finalize().should.be.rejectedWith(EVMRevert);

    await this.invest(investor, 6500);
    await this.tokenSale.finalize();

    assert (await this.token.owner()) == owner;
  });

  it("[future development wallet] test cannot receive money before 12 month cliff", async function () {
    const owner = accounts[0];

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(364));

    const oldBalance = (await this.token.balanceOf(owner)).div(1e18);

    await this.futureDevelopmentWallet.release.sendTransaction().should.be.rejectedWith(EVMRevert);
    await this.assertTokenBalance(owner, oldBalance);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(365) + duration.days(1));

    await this.futureDevelopmentWallet.release.sendTransaction();

    await this.assertTokenBalance(owner, oldBalance.add(300000000 * 0.21 * 0.25));
  });

  it("[future development wallet] test withdraw all funds at once", async function () {
    const owner = accounts[0];

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(364));

    const oldBalance = (await this.token.balanceOf(owner)).div(1e18);

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(365 * 4 + 1) + duration.hours(5));
    await this.futureDevelopmentWallet.release.sendTransaction();

    await this.assertTokenBalance(owner, oldBalance.add(300000000 * 0.21));
  });

  it("[future development wallet] test withdraw funds in batches", async function () {
    const owner = accounts[0];

    await this.fastForwardToAfterCrowdsaleEnd(duration.days(364));

    const oldBalance = (await this.token.balanceOf(owner)).div(1e18);
    let lastBalance = oldBalance;

    for (let i of _.range(1, 5)) {
      await this.fastForwardToAfterCrowdsaleEnd(duration.days(365 * i + 1) + duration.hours(5));
      await this.futureDevelopmentWallet.release.sendTransaction();

      const newBalance = (await this.token.balanceOf(owner)).div(1e18);
      newBalance.should.be.bignumber.above(lastBalance);
      lastBalance = newBalance;
    }

    await this.assertTokenBalance(owner, oldBalance.add(300000000 * 0.21));
  });  
});

contract('CUZToken', function(accounts) {
  it("transfer ownership not as owner", async function () {
    const presaleStartTime = (new BigNumber(latestTime())).add(duration.hours(1));
    const startTime = presaleStartTime.add(duration.weeks(2)); // two weeks of public pre-sale
    const endTime = startTime.add(duration.weeks(4)); // 4 weeks of public sale

    const baeToken = await CUZBAETokenVesting.new(endTime);
    const teamToken = await CUZTeamTokenVesting.new(endTime);
    const teamReserveToken = await CUZTeamReserveTokenVesting.new(endTime);
    const futureDevWallet = await CUZFutureDevelopmentWallet.new(endTime);

    const token = await CUZ.new(
      {
        gas: 40000000,
      }
    );
    
    await token.transferOwnership.sendTransaction(accounts[4], {from: accounts[4]}).should.be.rejectedWith(EVMRevert);

  });

  it("set token not as owner", async function () {
    var startTime = (new BigNumber(latestTime())).add(duration.weeks(2)); // two weeks of public pre-sale
    const endTime = startTime.add(duration.weeks(4)); // 4 weeks of public sale

    const baeToken = await CUZBAETokenVesting.new(endTime);
    const teamToken = await CUZTeamTokenVesting.new(endTime);
    const teamReserveToken = await CUZTeamReserveTokenVesting.new(endTime);
    const futureDevWallet = await CUZFutureDevelopmentWallet.new(endTime);

    const token = await CUZ.new(
      {
        gas: 40000000
      }
    );

    await baeToken.setToken.sendTransaction(token.address, {from: accounts[1]}).should.be.rejectedWith(EVMRevert);
  });
});
