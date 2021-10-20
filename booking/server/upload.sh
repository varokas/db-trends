#!/bin/bash
aws lambda --profile varokas-chuladb-admin  update-function-code --function-name getBooking-4f4ac4b --zip-file fileb://dist/function.zip