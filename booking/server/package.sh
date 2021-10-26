#!/bin/bash
set -x
rm -rf dist
rm -rf static
mkdir -p dist
mkdir -p static 

cp ../client/dist/* static
npm run build

cd dist
zip -r function.zip *

cd ..
zip dist/function.zip *
zip -r dist/function.zip static
zip -r dist/function.zip node_modules

# aws lambda update-function-code --function-name my-function --zip-file fileb://function.zip
