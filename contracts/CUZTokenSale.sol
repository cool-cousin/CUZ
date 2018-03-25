pragma solidity ^0.4.18;

import "../zeppelin-solidity/contracts/crowdsale/CappedCrowdsale.sol";
import "../zeppelin-solidity/contracts/token/ERC20/MintableToken.sol";
import "../zeppelin-solidity/contracts/token/ERC20/CappedToken.sol";
import "../zeppelin-solidity/contracts/token/ERC20/SafeERC20.sol";

contract CUZ is CappedToken {
  string public name = "CUZToken";
  string public symbol = "CUZ";
  uint8 public decimals = 18;

  function CUZ(address baeWallet, address teamWallet, address teamReserveWallet, address futureDevelopmentWallet) public
    CappedToken(300000000 * 10 ** 18)
  {
    mint(baeWallet, 300000000 * (7.33 / 100) * 10 ** 18);
    mint(teamWallet, 300000000 * (6.5 / 100) * 10 ** 18);
    mint(teamReserveWallet, 300000000 * (3.5 / 100) * 10 ** 18);
    mint(futureDevelopmentWallet, 300000000 * (21 / 100) * 10 ** 18);

    mint(msg.sender, (
      (300000000 * (0.67 / 100) * 10 ** 18) +  // bounty funds
      (300000000 * (25 / 100) * 10 ** 18) +  // community funds
      (300000000 * (3 / 100) * 10 ** 18)  // future funds - liquidated portion
    ));
  }
}

contract CUZCrowdsaleTokenVesting is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for CUZ;

  struct Vesting {
    address beneficiary;
    uint256 weiAmount;
    uint256 endTime;
  }

  CUZ public token;
  Vesting[] public vestings;

  function CUZCrowdsaleTokenVesting(CUZ _token) public
    Ownable()
  {
    token = _token;
  }

  function addVesting(address beneficiary, uint256 weiAmount, uint256 endTime) public onlyOwner {
    // this function is called when transferring eth into the crowdsale contract (that is, investing in our ICO).
    // as such, this fuction needs to be as slim, gas-wise, as possible.
    // that's why we shouldn't do more advanced things here, such as testing for the presence of a previous `Vesting`
    // object for the same `beneficiary` and `endTime`, instead of always push a new object into the array
    vestings.push(Vesting(beneficiary, weiAmount, endTime));
  }

  function vestedAmount(address beneficiary) public view returns(uint256 result) {
    for (uint256 i = 0; i < vestings.length; i++) {
      Vesting storage curVesting = vestings[i];

      if (curVesting.beneficiary == beneficiary) {
        result = result.add(vestings[i].weiAmount);
      }
    }
  }

  // this function is very much not optimized (it runs in O(n^2) where n is the number of `Vesting` objects).
  // the tradeoff in this function is so that the `addVesting` function can be much simpler, and cost less gas to the
  // interested ICO invester.
  // this function we can call ourselves, and pay the premium on the gas needed for the extra computation, rather than
  // our contributors having to pay any extra.
  function transferReleasedVestedFunds() public { 
    for (uint i = 0; i < vestings.length; i++) {
      Vesting storage outerVesting = vestings[i];
      address beneficiary = outerVesting.beneficiary;
      uint256 weiAmount = 0; 

      for (uint j = 0; j < vestings.length; j++) {
        Vesting storage innerVesting = vestings[j];

        if (innerVesting.beneficiary == beneficiary && now >= innerVesting.endTime) {
          weiAmount = weiAmount.add(innerVesting.weiAmount);
          innerVesting.weiAmount = 0;
        }
      }

      if (weiAmount > 0) {
        token.safeTransfer(beneficiary, weiAmount);
      }
    }
  }
}


contract CUZNormalTokenVesting is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for ERC20Basic;

  struct Vesting {
    address beneficiary;
    uint256 weiAmount;
  }

  ERC20Basic public token;
  uint256 public endTime;

  modifier hasToken() {
    require(token != address(0));
    _;
  }

  function setToken(ERC20Basic token_) public onlyOwner {
    require(token == address(0));

    token = token_;
  }

  // TODO: reduce code duplication
  function transferReleasedVestedFunds() public hasToken {
    require(now >= endTime);

    token.safeTransfer(owner, token.balanceOf(this));
  }
}

contract CUZBAETokenVesting is CUZNormalTokenVesting {
  using SafeMath for uint256;

  function CUZBAETokenVesting(uint256 tokenSaleEndTime) public
    Ownable()
  {
    endTime = tokenSaleEndTime.add(86400 * 30 * 9);
  } 
}

contract CUZTeamTokenVesting is CUZNormalTokenVesting {
  using SafeMath for uint256;

  function CUZTeamTokenVesting(uint256 tokenSaleEndTime) public
    Ownable()
  {
    endTime = tokenSaleEndTime.add(86400 * 365 * 2);
  }
}

contract CUZTeamReserveTokenVesting is CUZNormalTokenVesting {
  using SafeMath for uint256;

  function CUZTeamReserveTokenVesting(uint256 tokenSaleEndTime) public
    Ownable()
  {
    endTime = tokenSaleEndTime.add(86400 * 365 * 1);
  }
}

contract CUZFutureDevelopmentWallet is Ownable {
  using SafeMath for uint256;
  using SafeERC20 for ERC20Basic;

  ERC20Basic public token;
  uint256 public vestingStartTime;
  uint256 public releasedAmountInWei;

  function CUZFutureDevelopmentWallet(uint256 tokenSaleEndTime) public
    Ownable()
  {
    vestingStartTime = tokenSaleEndTime;   
  }

  modifier hasToken () {
    require(token != address(0));
    _;
  }

  function setToken(ERC20Basic token_) public onlyOwner {
    require(token == address(0));

    token = token_;
  }

  function release() public hasToken returns (bool) {
    require(token.balanceOf(this).add(releasedAmountInWei) == 300000000 * (21 / 100) * 10 ** 18);  // sanity check

    // cliff is 1 year, before that do nothing
    require(now >= vestingStartTime.add(86400 * 365));

    // make sure we have un-released funds left
    require(releasedAmountInWei < 300000000 * (21 / 100) * 10 ** 18);

    // calculate the amount released.
    // every month until 4 years have passed -> a 48th of the total amount
    uint256 monthsPassed = now.sub(vestingStartTime).div((365 * 4 + 1) / 48 * 86400);
    uint256 amountToReleaseInWei = monthsPassed.mul(300000000 * (21 / 100) / 48 * 10 ** 18).sub(releasedAmountInWei);

    require(amountToReleaseInWei > 0);

    token.safeTransfer(owner, amountToReleaseInWei);
    releasedAmountInWei = releasedAmountInWei.add(amountToReleaseInWei);
  }
}

contract CUZTokenSale is CappedCrowdsale, Ownable {
  using SafeMath for uint256;
  using SafeERC20 for MintableToken;

  CUZCrowdsaleTokenVesting public tokenVesting;
  mapping(address => uint256) public whitelistedAmountInWei;
  uint256 constant private MONTH = 86400 * 30;

  mapping(address => uint256) public contributionsInWei;
  address[] contributors;

  uint256 public presaleStartTime;


  function CUZTokenSale(uint256 _presaleStartTime, uint256 _startTime, uint256 _endTime,
                        MintableToken _token, CUZCrowdsaleTokenVesting _tokenVesting, address _wallet)
    public
    CappedCrowdsale(17500 * 10 ** 18)
    Crowdsale(_startTime, _endTime, 3770, _wallet, _token)
    Ownable()
  {
    require(_startTime > _presaleStartTime);

    presaleStartTime = _presaleStartTime;
    tokenVesting = _tokenVesting;
  }

  function setExpenses(uint256 expensesInWei) onlyOwner {
    require(isPrivateSale());
    require(weiRaised == 0);
    require(expensesInWei > 0);

    weiRaised = weiRaised.add(expensesInWei);
    contributionsInWei[wallet] = expensesInWei;
    contributors.push(wallet);

    token.mint(wallet, getTokenAmount(expensesInWei));
  }

  function isPrivateSale() internal view returns (bool)
  {
    return (now < presaleStartTime);
  }

  function isPreSale() internal view returns (bool)
  {
    return (now > presaleStartTime && now < startTime);
  }

  function isPublicSale() internal view returns (bool) {
    return (now > startTime);
  }

  function buyTokens(address beneficiary) public payable {
    super.buyTokens(beneficiary);

    // we need to keep a list of contributors and their contributed amount in the case where we don't finish the crowdsale cap and 
    // have to distribute the remaining tokens to all participants
    if (contributionsInWei[beneficiary] == 0) {
      contributors.push(beneficiary);
    }

    contributionsInWei[beneficiary] = contributionsInWei[beneficiary].add(msg.value);

    // during the private sale, the sender/wallet owner (verified that they are one and the same in `validPurchase`) does not need to be whitelisted
    if (!isPrivateSale()) {
      whitelistedAmountInWei[beneficiary] = whitelistedAmountInWei[beneficiary].sub(msg.value);
    }

    uint256 bonusWeiAmount;
    uint256 vestingDuration;

    if (isPublicSale()) {
      // public crowdsale has bonuses based on how long after crowdsale start the contributor joined
      uint256 daysSinceStart = (now - startTime).div(86400);

      // starting from week 3 of crowdsale on - no bonus
      if (daysSinceStart < 14) {
        if (daysSinceStart < 1) {
          // 20% bonus in first 24 hours
          bonusWeiAmount = getTokenAmount(msg.value).div(5);
          vestingDuration = MONTH * 3;
        } else if (daysSinceStart < 7) {
          // 10% bonus in days 2-7
          bonusWeiAmount = getTokenAmount(msg.value).div(10);
          vestingDuration = MONTH * 3 / 2;
        } else {
          // 5% bonus in week 2
          bonusWeiAmount = getTokenAmount(msg.value).div(20);
          vestingDuration = MONTH;
        }
      }
    } else {
      // private sale and public pre-sale have bonuses based on contribution amount

      if (msg.value <= 10 * 10 ** 18) {
        // 20% on 0.1(min)eth->10 eth
        bonusWeiAmount = getTokenAmount(msg.value).div(5);
        vestingDuration = MONTH * 3;
      } else if (msg.value <= 50 * 10 ** 18) {
        // 25% on 10eth->50eth
        bonusWeiAmount = getTokenAmount(msg.value).div(4);
        vestingDuration = MONTH * 3;
      } else if (msg.value <= 100 * 10 ** 18) {
        // 30% on 50eth->100eth
        bonusWeiAmount = getTokenAmount(msg.value).mul(30).div(100);
        vestingDuration = MONTH * 6;
      } else if (msg.value <= 250 * 10 ** 18) {
        // 35% on 100eth->250eth
        bonusWeiAmount = getTokenAmount(msg.value).mul(35).div(100);
        vestingDuration = MONTH * 6;
      } else if (msg.value <= 500 * 10 ** 18) {
        // 40% on 250eth->500eth
        bonusWeiAmount = getTokenAmount(msg.value).mul(4).div(10);
        vestingDuration = MONTH * 9;
      } else {
        // 50% on >500eth
        bonusWeiAmount = getTokenAmount(msg.value).div(2);
        vestingDuration = MONTH * 9;
      }
    }

    if (bonusWeiAmount > 0) {
      if (!isPrivateSale()) {
          // mint the tokens to the vesting contract
          token.mint(tokenVesting, bonusWeiAmount);
          // register the vesting for the beneficiary
          tokenVesting.addVesting(beneficiary, bonusWeiAmount, endTime.add(vestingDuration));
        } else {
          // tokens received in the private sale should not be vested in any way, just passed to the wallet owner
          token.mint(beneficiary, bonusWeiAmount);
        }
    }
  }

  function forwardFunds() internal {
    // the original OpenZeppelin crowdsale contract forwards any funds received from contributors to a wallet address.
    // we prefer to pro-actively call the `whithdrawFunds` function and withdraw any amount we currently want.
    // override this function to prevent the funds from being forwarded (the eth value will stay assoicated with this contract address)
  }

  function withdrawFunds(uint256 weiAmount) public {
    require(msg.sender == wallet);
    require(weiAmount > 0);

    wallet.transfer(weiAmount);
  }

  function validPurchase() internal view returns (bool) {
    if ((now < presaleStartTime && msg.sender != wallet) ||  // only the wallet owner can invest during the private sale (before public presale),
                                                             // does not need to be whitelisted
        whitelistedAmountInWei[msg.sender] < msg.value) {  // make sure the amount is whitelisted for this address
      return false;
    }

    bool withinPeriod = now <= endTime;  // make sure we are not past the end of the public crowdsale
    bool higherThanMinimum = msg.value >= 0.1 * 10 ** 18;  // the minimum contribution is 0.1eth
    bool lowerThanMaximum = (now < presaleStartTime  // the first 3 hours of the presale have a maximum contribution of 3 eth
      || now >= presaleStartTime.add(3600 * 3)
      || msg.value.add(contributionsInWei[msg.sender]) <= 3 * 10 ** 18  // take into account any previous contributions
    );
    bool withinCap = weiRaised.add(msg.value) <= cap;  // make sure we have not passed the eth contribution cap
    return withinCap && withinPeriod && higherThanMinimum && lowerThanMaximum;
  }

  function setWhitelistedAmount(address wallet, uint256 amountInWei) onlyOwner public {
    whitelistedAmountInWei[wallet] = amountInWei;
  }

  function increaseWhiteListedAmount(address wallet, uint256 amountInWei) onlyOwner public {
    whitelistedAmountInWei[wallet] = whitelistedAmountInWei[wallet].add(amountInWei);
  }

  function releaseUnsoldTokens() public {
    require(now > endTime);
    require(weiRaised > 0);

    // in case we the crowdsale time has ended and we have not fulfilled the cap, distribute remainining tokens between
    // all token holders

    uint256 tokensLeft = CappedToken(token).cap().sub(token.totalSupply());

    // 67% of the total token cap are minted for various internal CC uses,
    // so CC deserves 67% of the tokens left at the end of a non-fulfilled crowdsale
    uint256 tokensForCompany = tokensLeft.div(100).mul(67);
    tokensLeft = tokensLeft.sub(tokensForCompany);
    token.mint(wallet, tokensForCompany);

    require(tokensLeft > 0);  // sanity check

    for (uint i = 0; i < contributors.length; i++) {
      address contributor = contributors[i];
      uint256 contributionInWei = contributionsInWei[contributor];

      if (contributionInWei > 0) {
        // the percentage of this contributor's contribution from the total wei raised, is the percentage of the tokens left that he/she should
        // be getting
        uint256 dividendInWei = tokensLeft.mul(contributionInWei).div(weiRaised);
        require(dividendInWei > 0);  // sanity check

        // an address can (theoretically) appear multiple times in the `contributors` array, so make sure a second iteration over this address
        // will not result in duplicate dividend-sending
        contributionsInWei[contributor] = contributionsInWei[contributor].sub(contributionInWei);

        token.mint(contributor, dividendInWei);
      }
    }
  }
}
