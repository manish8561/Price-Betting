const hre = require("hardhat");

async function main() {
  await hre.run("verify:verify", {
    //Deployed contract address
    address: "0xffdBd03C1c01240f0A4a2901b5635b2187E901b0",
    //Pass arguments as string and comma seprated values
    constructorArguments: [],
    //Path of your main contract.
    contract:
      "contracts/CollectiveVault.sol:CollectiveVault",
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
//npx hardhat run --network rinkeby  scripts/verify.ts
//"contracts/upgradeability/OwnedUpgradeabilityProxy.sol:OwnedUpgradeabilityProxy",
//"contracts/OZV0.sol:OZV0",
