#!/bin/bash
set -x
mkdir -p dist
rm dist/function.zip
rm -rf dist/static
mkdir dist/static
cp ../client/dist/* dist/static
zip -r dist/function.zip *
# aws lambda update-function-code --function-name my-function --zip-file fileb://function.zip
