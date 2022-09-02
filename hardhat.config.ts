import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import dotenv from "dotenv";
dotenv.config();
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.16",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  gasReporter: {
    enabled: false,
    // coinmarketcap: process.env.CMC_API,
  },

  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: [`${process.env.PRIVATE_KEY_RINKEBY}`],
    },

    // SmartChain: {
    //   url: process.env.BINANCE_DEPLOY_RPC,
    //   chainId: 56,
    //   gasPrice: 20000000000,
    //   accounts: [`${process.env.PRIVATE_KEY_SMARTCHAIN}`],
    // },

    Rinkeby: {
      url: process.env.INFURA_RINKEBY,
      accounts: [`${process.env.PRIVATE_KEY_RINKEBY}`],
      gas:"auto",
      gasPrice:"auto",
    },

    hardhat: {
      accounts: {
        mnemonic: process.env.MNEMONIC,
        count: 1500,
      },
      // forking: {
      //   url: process.env.BINANCE_RPC,
      //   // blockNumber: 19649729,
      // },
      // chainId: 1337,
      // gas: 10000000,
      // blockGasLimit: 10000000,
      // allowUnlimitedContractSize: true,
    },
  },

  etherscan: {
    apiKey: process.env.RINKEBY_API,
  },
};

export default config;
