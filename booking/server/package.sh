#!/bin/bash
zip -r function.zip .
# aws lambda update-function-code --function-name my-function --zip-file fileb://function.zip
