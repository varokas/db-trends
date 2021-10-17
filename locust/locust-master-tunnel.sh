#!/bin/bash
ssh -i ~/.ssh/varokas -L 8089:localhost:8089 ec2-user@100.20.101.162
