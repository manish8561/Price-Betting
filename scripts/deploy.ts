import { ethers } from "hardhat";

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms * 1000));

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Owner Address", owner.address);

  let Proxy = await ethers.getContractFactory("OwnedUpgradeabilityProxy");
  let proxy = await Proxy.deploy();
  console.log("Proxy Address", proxy.address);

  let XIV = await ethers.getContractFactory("XIV");
  let xiv = await XIV.deploy("XIV", "XIV");
  console.log("XIV Address", xiv.address);
  let BTC = await ethers.getContractFactory("BTC");
  let btc = await BTC.deploy("BTC", "BTC");
  console.log("BTC address", btc.address);

  let BNB = await ethers.getContractFactory("ETH");
  let bnb = await BNB.deploy("BNB", "BNB");
  console.log("ETH address", bnb.address);

  let CollectiveVault = await ethers.getContractFactory("CollectiveVault");
  let collectiveVault = await CollectiveVault.deploy();
  console.log("Collective Vault", collectiveVault.address);

  await sleep(2 * 60);

  const initializeData = collectiveVault.interface.encodeFunctionData(
    "initialize",
    [xiv.address, owner.address, owner.address]
  );

  let tx = await proxy.upgradeToAndCall(
    collectiveVault.address,
    initializeData
  );

  await tx.wait();

  const contract = collectiveVault.attach(proxy.address);

  tx = await contract.connect(owner).addToken(ethers.constants.AddressZero);
  await tx.wait();

  tx = await contract
    .connect(owner)
    .addChainlinkAddress(
      ethers.constants.AddressZero,
      "0x8a753747a1fa494ec906ce90e9f37563a8af630e"
    );
  await tx.wait();

  tx = await contract.connect(owner).addToken(bnb.address);
  await tx.wait();

  tx = await contract
    .connect(owner)
    .addChainlinkAddress(
      bnb.address,
      "0xcf0f51ca2cDAecb464eeE4227f5295F2384F84ED"
    );
  await tx.wait();

  tx = await contract.connect(owner).addToken(btc.address);
  await tx.wait();

  tx = await contract
    .connect(owner)
    .addChainlinkAddress(
      btc.address,
      "0x2431452A0010a43878bF198e170F6319Af6d27F4"
    );

  await tx.wait();

  console.log("Deployment Finished.............");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
