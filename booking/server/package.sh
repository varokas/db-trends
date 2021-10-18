#!/bin/bash
rm dist/function.zip
zip -r dist/function.zip .
# aws lambda update-function-code --function-name my-function --zip-file fileb://function.zip
