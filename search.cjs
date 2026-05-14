const { ethers } = require("ethers");
const fs = require("node:fs");
const path = require("node:path");

// ========= 这里改成你的参数 =========

// 你部署好的 Create2Factory 地址
const FACTORY_ADDRESS = "0xF5f23Ef62D7dF53d0516821e96A0BC4B2c095C40";

// 你的钱包地址。新版 BatchDistributor constructor(address initialOwner) 会把它设为 owner。
const OWNER_ADDRESS = "0x459080fE44E477Aeab9D5947Db55dF2d6B33a9a3";


// 目标前缀，想要 aaaaa 开头就填这个
const TARGET_PREFIX = "0x8888"

// 从哪个 salt 开始找
let start = 0n;

// ========= 下面不用改 =========

const COMPILED_BYTECODE_PATH = path.join(
  __dirname,
  "artifacts",
  "contracts_BatchDistributor_sol_BatchDistributor.bin"
);

function getBatchDistributorBytecode() {
  if (!fs.existsSync(COMPILED_BYTECODE_PATH)) {
    throw new Error("Missing compiled bytecode. Run npm run compile:contract first.");
  }

  const compiledBytecode = fs.readFileSync(COMPILED_BYTECODE_PATH, "utf8").trim();
  console.log("Using compiled bytecode:", COMPILED_BYTECODE_PATH);
  return compiledBytecode.startsWith("0x") ? compiledBytecode : `0x${compiledBytecode}`;
}

function getCreationCode(bytecode, ownerAddress) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const encodedArgs = coder.encode(["address"], [ownerAddress]);
  return bytecode + encodedArgs.slice(2);
}

function toSalt(i) {
  return ethers.zeroPadValue(ethers.toBeHex(i), 32);
}

function main() {
  const creationCode = getCreationCode(
    getBatchDistributorBytecode(),
    OWNER_ADDRESS
  );

  const bytecodeHash = ethers.keccak256(creationCode);

  console.log("Factory:", FACTORY_ADDRESS);
  console.log("Owner  :", OWNER_ADDRESS);
  console.log("Target :", TARGET_PREFIX);
  console.log("Bytecode hash:", bytecodeHash);

  while (true) {
    const salt = toSalt(start);
    const addr = ethers.getCreate2Address(
      FACTORY_ADDRESS,
      salt,
      bytecodeHash
    );

    if (addr.toLowerCase().startsWith(TARGET_PREFIX.toLowerCase())) {
      console.log("\nFOUND");
      console.log("salt    =", salt);
      console.log("address =", addr);
      console.log("creationCode =", creationCode);
      break;
    }

    if (start % 100000n === 0n) {
      console.log("checked", start.toString(), "latest", addr);
    }

    start++;
  }
}

main();
