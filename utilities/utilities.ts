import { BigNumber } from "ethers";
import { ethers } from "hardhat";

export function expandTo30Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(30));
}

export function expandTo17Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(17));
}

export function expandTo18Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(18));
}

export function expandTo6Decimals(n: number): BigNumber {
  return BigNumber.from(n).mul(BigNumber.from(10).pow(6));
}

export function add(n: BigNumber, m: BigNumber): BigNumber {
  return n.add(m);
}


export function sub(n: BigNumber, m: BigNumber): BigNumber {
  return n.sub(m);
}
export type FunctionParams = { type: string; value: any };
