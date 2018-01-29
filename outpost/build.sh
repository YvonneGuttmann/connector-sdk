#!/bin/bash

PLATFORM=`node -e "console.log(require('os').platform())"`
export NODE_VER="v8.9.4"
export NODE_VER_NAME="node-${NODE_VER}-${PLATFORM}-x64"
export OUTPOST_DIR="node_modules/connector-controller/outpost"

rm -rf build
mkdir -p build/connector

cp -rf  ${OUTPOST_DIR}/module/* build/
cp -f   ./build.sh build/
cp -rf  ./package.json build/connector/
cp -f   ./index.js build/connector/
cp -rf  ./bin build/connector/
cp -rf  ./lib build/connector/
cp -rf  ./resources build/connector/
cp -rf  ./doc build/connector/

cd build
wget https://nodejs.org/dist/${NODE_VER}/${NODE_VER_NAME}.tar.gz
tar xvzf ${NODE_VER_NAME}.tar.gz
cp ${NODE_VER_NAME}/bin/node ./connector

cd connector
./node ../${NODE_VER_NAME}/bin/npm install --production
cd ../

${NODE_VER_NAME}/bin/node ./connector/${OUTPOST_DIR}/jsonMerger.js ./connector/${OUTPOST_DIR}/module/module.json ../package.json module.json

rm -rf ${NODE_VER_NAME}*

cd ../





