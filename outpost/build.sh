#!/bin/bash

PLATFORM=`node -e "console.log(require('os').platform())"`
export NODE_VER="v8.9.1"
export NODE_VER_NAME="node-${NODE_VER}-${PLATFORM}-x64"
export OUTPOST_DIR="node_modules/base-connector/outpost"

rm -rf build
rm -rf node_modules

mkdir -p build/connector

cd build

./build/${NODE_VER_NAME}/bin/npm install --production

cp -rf  ${OUTPOST_DIR}/module/* build/
cp -f   ./build.sh build/
cp -rf  ./package.json build/connector/
cp -f   ./index.js build/connector/
cp -rf  ./bin build/connector/
cp -rf  ./lib build/connector/
cp -rf  ./resources build/connector/
cp -rf  ./doc build/connector/

wget https://nodejs.org/dist/${NODE_VER}/${NODE_VER_NAME}.tar.gz
tar xvzf ${NODE_VER_NAME}.tar.gz
cp ${NODE_VER_NAME}/bin/node .

cd ../

cd build
rm -rf ${NODE_VER_NAME}*
if [ -f build.sh ]; then
    /bin/bash build.sh
fi




