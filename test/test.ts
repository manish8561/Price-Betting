import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import { expandTo18Decimals, add, sub } from "../utilities/utilities";
const helpers = require("@nomicfoundation/hardhat-network-helpers");
import { BigNumber } from "ethers";

describe("CollectiveVault", () => {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  const deployProxy = async () => {
    let Proxy = await ethers.getContractFactory("OwnedUpgradeabilityProxy");
    let proxy = await Proxy.deploy();
    return proxy;
  };

  const deployCollectiveVault = async () => {
    let CollectiveVault = await ethers.getContractFactory("CollectiveVault");
    let collectiveVault = await CollectiveVault.deploy();
    return collectiveVault;
  };

  const deployXIV = async () => {
    let XIV = await ethers.getContractFactory("XIV");
    let xiv = await XIV.deploy("XIV", "XIV");
    return xiv;
  };

  const deployTokens = async () => {
    let BTC = await ethers.getContractFactory("BTC");
    let btc = await BTC.deploy("BTC", "BTC");

    let ETH = await ethers.getContractFactory("ETH");
    let eth = await ETH.deploy("ETH", "ETH");

    return { btc, eth };
  };

  const addTokens = async (contract: any, btc: any, bnb: any) => {
    await contract.addToken(ethers.constants.AddressZero);

    await contract.addChainlinkAddress(
      ethers.constants.AddressZero,
      "0x8A753747A1Fa494EC906cE90E9f37563A8AF630e"
    );
    await contract.addToken(btc.address);
    await contract.addChainlinkAddress(
      btc.address,
      "0xECe365B379E1dD183B20fc5f022230C044d51404"
    );
    await contract.addToken(bnb.address);

    await contract.addChainlinkAddress(
      bnb.address,
      "0xcf0f51ca2cDAecb464eeE4227f5295F2384F84ED"
    );
  };

  const attachCollectiveVaultWithProxy = async () => {
    const [owner, otherAccount] = await ethers.getSigners();
    const proxy = await loadFixture(deployProxy);
    const xiv = await loadFixture(deployXIV);
    const { btc, eth } = await loadFixture(deployTokens);
    const collectiveVault = await loadFixture(deployCollectiveVault);

    const contract = collectiveVault.attach(proxy.address);

    const initializeData = collectiveVault.interface.encodeFunctionData(
      "initialize",
      [xiv.address, owner.address, owner.address]
    );

    await proxy.upgradeToAndCall(collectiveVault.address, initializeData);

    return { contract, owner, otherAccount, xiv, btc, eth };
  };

  describe("Deployment", () => {
    it("Should set the right token Address", async () => {
      const { contract, xiv, owner } = await loadFixture(
        attachCollectiveVaultWithProxy
      );
      expect(await contract.XIV()).to.equal(xiv.address);
      expect(await contract.owner()).to.equal(owner.address);
      expect(await contract.operator()).to.equal(owner.address);
      expect(await contract.divisor()).to.equal(10000);

      let slotDetails = await contract.slotPlan(1);
      let userLimit = slotDetails.userlimit;
      let minimumAmt = slotDetails.minimumAmt;
      let slot = slotDetails.slot;

      expect(userLimit).to.be.equal(10);
      expect(minimumAmt).to.be.equal(expandTo18Decimals(1000));
      expect(slot).to.be.equal(10800);

      slotDetails = await contract.slotPlan(3);
      userLimit = slotDetails.userlimit;
      minimumAmt = slotDetails.minimumAmt;
      slot = slotDetails.slot;

      expect(userLimit).to.be.equal(2);
      expect(minimumAmt).to.be.equal(expandTo18Decimals(3000));
      expect(slot).to.be.equal(1800);

      expect(await contract.fees()).to.be.equal(2500);
    });
  });

  describe("Place a Prediction", () => {
    it("Should not increase the counter before slot period expires", async () => {
      const { contract, xiv, owner, otherAccount, btc, eth } =
        await loadFixture(attachCollectiveVaultWithProxy);

      await addTokens(contract, btc, eth);

      await xiv.approve(contract.address, expandTo18Decimals(1000000));

      await contract.predict(
        expandTo18Decimals(1000),
        100,
        1,
        ethers.constants.AddressZero
      );

      await contract.predict(expandTo18Decimals(1000), 100, 1, btc.address);

      await contract.predict(expandTo18Decimals(2000), 100, 1, eth.address);
      let counterETHAfter = await contract.counter(
        1,
        ethers.constants.AddressZero
      );

      expect(counterETHAfter).to.be.equal(1);

      //

      await contract.predict(
        expandTo18Decimals(2000),
        100,
        2,
        ethers.constants.AddressZero
      );

      await contract.predict(expandTo18Decimals(2000), 100, 2, btc.address);

      await contract.predict(expandTo18Decimals(3000), 100, 2, eth.address);
      counterETHAfter = await contract.counter(2, ethers.constants.AddressZero);

      expect(counterETHAfter).to.be.equal(1);

      //

      await xiv.transfer(otherAccount.address, expandTo18Decimals(40000));
      await xiv
        .connect(otherAccount)
        .approve(contract.address, expandTo18Decimals(40000));
      await contract
        .connect(otherAccount)
        .predict(
          expandTo18Decimals(2000),
          100,
          2,
          ethers.constants.AddressZero
        );

      await contract
        .connect(otherAccount)
        .predict(expandTo18Decimals(2000), 100, 2, btc.address);

      await contract
        .connect(otherAccount)
        .predict(expandTo18Decimals(3000), 100, 2, eth.address);
      counterETHAfter = await contract.counter(2, ethers.constants.AddressZero);

      expect(counterETHAfter).to.be.equal(1);
    });

    it("Should  increase the counter after slot period expires", async () => {
      const { contract, xiv, owner, otherAccount, btc, eth } =
        await loadFixture(attachCollectiveVaultWithProxy);

      await addTokens(contract, btc, eth);

      await xiv.approve(contract.address, expandTo18Decimals(1000000));

      await contract.predict(
        expandTo18Decimals(1000),
        100,
        1,
        ethers.constants.AddressZero
      );

      let slotDetails = await contract.slotPlan(1);
      let time = slotDetails.slot;
      await helpers.time.increase(time);

      await contract.predict(
        expandTo18Decimals(1000),
        100,
        1,
        ethers.constants.AddressZero
      );

      let counter = await contract.counter(1, ethers.constants.AddressZero);
      expect(counter).to.be.equal(2);

      await contract.predict(expandTo18Decimals(3000), 100, 3, btc.address);
      counter = await contract.counter(3, btc.address);
      expect(counter).to.be.equal(1);

      slotDetails = await contract.slotPlan(3);
      time = slotDetails.slot;
      await helpers.time.increase(time);

      await contract.predict(expandTo18Decimals(3000), 100, 3, btc.address);
      counter = await contract.counter(3, btc.address);
      expect(counter).to.be.equal(2);

      await helpers.time.increase(time);

      await contract.predict(expandTo18Decimals(3000), 100, 3, btc.address);
      counter = await contract.counter(3, btc.address);
      expect(counter).to.be.equal(3);
    });
  });

  describe("Resolving solo", () => {
    it("Resolving a solo bet", async () => {
      const { contract, xiv, owner, otherAccount, btc, eth } =
        await loadFixture(attachCollectiveVaultWithProxy);

      await addTokens(contract, btc, eth);
      let _totalAmount: BigNumber = BigNumber.from(0);
      let len: number = 0;
      const value = sub(expandTo18Decimals(1000), expandTo18Decimals(250));

      for (let i = 1; i <= 10; i++) {
        let _user = await ethers.getSigners();
        let user = _user[i];

        await xiv
          .connect(owner)
          .transfer(user.address, expandTo18Decimals(1000));
        await xiv
          .connect(user)
          .approve(contract.address, expandTo18Decimals(1000));
        let ownerBalance = await xiv.balanceOf(owner.address);
        await contract
          .connect(user)
          .predict(
            expandTo18Decimals(1000),
            2 * i * (10 ** 8),
            1,
            ethers.constants.AddressZero
          );

        _totalAmount = add(_totalAmount, value);
        let ownerBalanceWithFees = await xiv.balanceOf(owner.address);

        expect(ownerBalanceWithFees).to.be.above(ownerBalance);

        expect(await xiv.balanceOf(user.address)).to.be.equal(
          expandTo18Decimals(0)
        );

        const predictionDetails = await contract.PredictionDetail(
          1,
          ethers.constants.AddressZero,
          1
        );

        const userDetails = await contract.UserPrediction(
          1,
          ethers.constants.AddressZero,
          1,
          user.address
        );

        const endTime = predictionDetails.endTime.toNumber();
        const totalAmount = predictionDetails.totalAmount;
        const newAddition = await contract.getUsersList(
          1,
          ethers.constants.AddressZero,
          1
        );
        len = newAddition.length;
        const amt = userDetails.amount;
        const price = userDetails.price;
        const predictionTime = userDetails.predictionTime.toNumber();
        const status = userDetails.status;

        expect(endTime).to.not.equal(0);
        expect(totalAmount).to.be.equal(_totalAmount);
        expect(len).to.be.equal(i);
        expect(amt).to.be.equal(expandTo18Decimals(750));
        expect(price).to.be.equal(2 * i * (10 ** 8));
        expect(predictionTime).to.above(0);
        expect(status).to.be.equal(1);
      }
      await time.increase(24 * 60 * 60 + 10800);
      const tx = await contract.resolving(1, ethers.constants.AddressZero, 1);
      const receipt = await tx.wait();

      console.log(
        receipt.events?.filter((x) => {
          return x.event == "ResolvedPredictions";
        })
      );
    });
  });
  describe.only("Resolving user-user", () => {
    it.only("Resolving a user-user bet", async () => {
      const { contract, xiv, owner, otherAccount, btc, eth } =
        await loadFixture(attachCollectiveVaultWithProxy);

      await addTokens(contract, btc, eth);
      let _totalAmount: BigNumber = BigNumber.from(0);
      let len: number = 0;
      const value = sub(expandTo18Decimals(3000), expandTo18Decimals(750));

      for (let i = 1; i <= 2; i++) {
        let _user = await ethers.getSigners();
        let user = _user[i];

        await xiv
          .connect(owner)
          .transfer(user.address, expandTo18Decimals(3000));
        await xiv
          .connect(user)
          .approve(contract.address, expandTo18Decimals(3000));
        let ownerBalance = await xiv.balanceOf(owner.address);
        await contract
          .connect(user)
          .predict(
            expandTo18Decimals(3000),
            2 * i * (10 ** 8),
            3,
            ethers.constants.AddressZero
          );

        _totalAmount = add(_totalAmount, value);
        let ownerBalanceWithFees = await xiv.balanceOf(owner.address);

        expect(ownerBalanceWithFees).to.be.above(ownerBalance);

        expect(await xiv.balanceOf(user.address)).to.be.equal(
          expandTo18Decimals(0)
        );

        const predictionDetails = await contract.PredictionDetail(
          3,
          ethers.constants.AddressZero,
          1
        );

        const userDetails = await contract.UserPrediction(
          3,
          ethers.constants.AddressZero,
          1,
          user.address
        );

        const endTime = predictionDetails.endTime.toNumber();
        const totalAmount = predictionDetails.totalAmount;
        const newAddition = await contract.getUsersList(
          3,
          ethers.constants.AddressZero,
          1
        );
        len = newAddition.length;
        const amt = userDetails.amount;
        const price = userDetails.price;
        const predictionTime = userDetails.predictionTime.toNumber();
        const status = userDetails.status;
        expect(endTime).to.not.equal(0);
        expect(totalAmount).to.be.equal(_totalAmount);
        expect(len).to.be.equal(i);
        expect(amt).to.be.equal(expandTo18Decimals(2250));
        expect(price).to.be.equal(2 * i * (10 ** 8));
        expect(predictionTime).to.above(0);
        expect(status).to.be.equal(1);
      }
      await time.increase(24 * 60 * 60 + 1800);
      const tx = await contract.resolving(3, ethers.constants.AddressZero, 1);
      const receipt = await tx.wait();

      console.log(
        receipt.events?.filter((x) => {
          return x.event == "ResolvedPredictions";
        })
      );
    });
  });
});
