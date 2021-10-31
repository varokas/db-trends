//import * as mysql from '@pulumi/mysql';
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as cloudflare from "@pulumi/cloudflare";
import { DefaultSubnet, DefaultVpc } from "@pulumi/aws/ec2";

//https://www.pulumi.com/docs/tutorials/aws/ec2-webserver/

const range = (n:Number) => [...Array(n).keys()]

const region = "us-west-2"
const azs = ["a","b","c","d"].map(az => `${region}${az}`)

const locustEC2Size = "t4g.nano";     // t2.micro is available in the AWS free tier
const arch = "arm64" //x86_64
const locustServersCount = 1

const redisDemoEC2Size = "t4g.micro"
const redisDemoArch = "arm64" //x86_64

const accountNumber = "445749771569"

const config = new pulumi.Config("db-trends");
const dbNameBookings = "bookings"
const dbUsername = config.requireSecret("dbUsername");
const dbPassword = config.requireSecret("dbPassword");

// Keys
const dbTrendsPubKey = new aws.ec2.KeyPair("dbtrends", {
  publicKey: "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC2nyFlMof+eiLZywFBOY9fzHN+B/tyBAqkQfngeYLblKlN8yI64C7CpufMGWHz+QLhWtipR4MP66aBML433cG/pqgZ7ZegTAPJzV1CBO+qJ3qKsTh7HSYIFtZOo6KIrd2eSWrcbXtpMNRDDHhPy1G1gczGZFUrCTG8V0ky9p8nL6Z0fDYLyFAX5Egc7pvCO5Bx/LqW/ap8YDUi9mzafYWjE7wLUNAeBzOSXDOnWdJuEmgeKo7IZ/Rfl0hXwb0r/CCSY60gmlAqo9zQj8t6ew8WS6BgR5lrFfr7u2pdtVdCCGp1KoAWu1Jh03hnDxbd7KMbFUtTE4UjyZArrt43iD3D6EARBEyGLlurwJoawxgSvHz1xojU80cEC/M/XtpN6k2QwXxJC5RMW+dL1PA3C9/tpBoMfpNEuSoA1/Vnse1D0YwGnDeJVszo1RNOx+kQ+4gpvnDN8KglHalGPt7Jz8RJLZ9nKjK/M9Vq7XprRLb2ZQ6B/cA5Y3bFFqulcxLasyc=",
});

// Users 
const adminGroup = new aws.iam.Group("admins", {
  path: "/admin/",
});
new aws.iam.GroupPolicyAttachment("admins", {
  group: adminGroup.name,
  policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
});

// EIPs & DNS
// const locustIPs = range(locustServersCount).map( i => new aws.ec2.Eip(`locust-${i}`));
// const locustRecords = range(locustServersCount).map( i => new cloudflare.Record(`locust-${i}`, {
//   name: `locust-${i}`,
//   zoneId: "b52117ad37fcc6bf9077251553d7d9d8",
//   type: "A",
//   value: locustIPs[i].publicIp,
//   ttl: 3600
// }))

const redisDemoEIP = new aws.ec2.Eip(`redisDemoIP`)
new cloudflare.Record(`redisDemoIP`, {
    name: `redis-demo`,
    zoneId: "b52117ad37fcc6bf9077251553d7d9d8",
    type: "A",
  value: redisDemoEIP.publicIp,
  ttl: 3600
})
export const redisDemoIP = redisDemoEIP.publicIp

// Network
const defaultVPC = new aws.ec2.DefaultVpc("default")
const defaultSubnets = azs.map(az => new aws.ec2.DefaultSubnet(`${az}`, {
    availabilityZone: az
}))


// Security Groups
const ec2SG = new aws.ec2.SecurityGroup("ec2-sg", {
  ingress: [
    { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 80, toPort: 80, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 5557, toPort: 5557, cidrBlocks: [defaultVPC.cidrBlock] },
  ], 
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ]
});
const rdsSG = new aws.ec2.SecurityGroup("rds-sg", {
  ingress: [
    { protocol: "tcp", fromPort: 3306, toPort: 3306, cidrBlocks: [defaultVPC.cidrBlock] },
  ], 
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ]
});
const lambdaSG = new aws.ec2.SecurityGroup("lambda-sg", {
  ingress: [
    { protocol: "tcp", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ], 
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ]
});

// DB 
const rds = new aws.rds.Instance('dbtrends-rds', {
  engine: 'mariadb',
  username: dbUsername,
  password: dbPassword,
  //availabilityZone: `${region}${azs[0]}`,
  instanceClass: 'db.t4g.micro',
  allocatedStorage: 10,
  deletionProtection: false,
  skipFinalSnapshot: true,
  name: dbNameBookings,
  vpcSecurityGroupIds: [rdsSG.id]
});
export const rdsEndpoint = rds.endpoint

// EC2
const ami = pulumi.output(aws.ec2.getAmi({
    filters: [
      { name: "name", values: ["amzn2-python3-*"] },
      { name: "architecture", values: [arch] } 
    ],
    owners: [accountNumber], // varokas-chuladb
    mostRecent: true,
}));

// const locustEC2s = range(locustServersCount).map( i => new aws.ec2.Instance(`locust-${i}`, {
//   instanceType: locustEC2Size,
//   vpcSecurityGroupIds: [ ec2SG.id ], // reference the security group resource above
//   ami: ami.id,
//   tags: {
//         Name: `Locust-${i}`,
//   },
//   keyName: dbTrendsPubKey.keyName,
//   associatePublicIpAddress: true,
//   userData: `#!/bin/bash
//   pip3 install locust
//   `
// }))
// export const locustEC2Hosts = locustEC2s.map( l => l.publicIp )

// const locustEIPAssocs = range(locustServersCount).map( i => new aws.ec2.EipAssociation(`eipAssoc-locust-${i}`, {
//   instanceId: locustEC2s[i].id,
//   allocationId: locustIPs[i].id,
// }))

const redisDemoEC2 = new aws.ec2.Instance(`redis-demo`, {
  instanceType: redisDemoEC2Size,
  vpcSecurityGroupIds: [ ec2SG.id ], // reference the security group resource above
  ami: ami.id,
  tags: {
        Name: `RedisDemo`,
  },
  keyName: dbTrendsPubKey.keyName,
  associatePublicIpAddress: true,
})
const lredisDemoEIPAssocs = new aws.ec2.EipAssociation(`eipAssoc-redisDemo`, {
  instanceId: redisDemoEC2.id,
  allocationId: redisDemoEIP.id,
})


// Lambda 
const iamForLambda = new aws.iam.Role("iamForLambda", {assumeRolePolicy: `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
`});

const lambdaPolicies = [
  aws.iam.ManagedPolicy.AWSLambdaVPCAccessExecutionRole,
  aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
  aws.iam.ManagedPolicies.AmazonDynamoDBFullAccess
]
lambdaPolicies.map( policyArn => new aws.iam.RolePolicyAttachment("lambda-" + policyArn, {
  policyArn: policyArn,
  role: iamForLambda
}))

const bookingLambda = new aws.lambda.Function("getBooking", {
  code: new pulumi.asset.FileArchive("../booking/server/dist/function.zip"),
  role: iamForLambda.arn,
  handler: "index.handler",
  runtime: aws.lambda.NodeJS12dXRuntime,
  environment: {
      variables: {
        DB_NAME: dbNameBookings,
        DB_HOST: rds.address,
        DB_USER: dbUsername,
        DB_PASSWORD: dbPassword,
      },
  },

  vpcConfig: {
    securityGroupIds: [lambdaSG.id],
    subnetIds: defaultSubnets.map(s => s.id)
  }
});

const bookingWithDynamoDBLambda = new aws.lambda.Function("bookingDynamo", {
  code: new pulumi.asset.FileArchive("../booking/server/dist/function.zip"),
  role: iamForLambda.arn,
  handler: "index.handler",
  runtime: aws.lambda.NodeJS12dXRuntime,
  environment: {
      variables: {
        DB_TYPE: "dynamodb",
      },
  },

  vpcConfig: {
    securityGroupIds: [lambdaSG.id],
    subnetIds: defaultSubnets.map(s => s.id)
  }
});

const bookingAPIGateway = new aws.apigatewayv2.Api("booking", {
  protocolType: "HTTP",
});
const stage = new aws.apigatewayv2.Stage("default", {name: "$default", apiId: bookingAPIGateway.id, autoDeploy: true});
const bookingAPILambdaIntegration = new aws.apigatewayv2.Integration("booking", {
  apiId: bookingAPIGateway.id,
  integrationType: "AWS_PROXY",
  connectionType: "INTERNET",
  integrationMethod: "POST",
  integrationUri: bookingLambda.invokeArn,
  passthroughBehavior: "WHEN_NO_MATCH",
  payloadFormatVersion: "2.0",
});
const bookingAPIRoute = new aws.apigatewayv2.Route("booking", {
  apiId: bookingAPIGateway.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${bookingAPILambdaIntegration.id}`
});
export const bookingURL = stage.invokeUrl

const bookingLambdaPermission = new aws.lambda.Permission("bookingLambdaPermission", {
  action: "lambda:InvokeFunction",
  function: bookingLambda.id,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${bookingAPIGateway.executionArn}/*/$default`,
});


const bookingDynamoAPIGateway = new aws.apigatewayv2.Api("bookingDynamo", {
  protocolType: "HTTP",
});
const stageBookingDynamo = new aws.apigatewayv2.Stage("bookingDynamo-default", {name: "$default", apiId: bookingDynamoAPIGateway.id, autoDeploy: true});
const bookingDynamoAPILambdaIntegration = new aws.apigatewayv2.Integration("bookingDynamo", {
  apiId: bookingDynamoAPIGateway.id,
  integrationType: "AWS_PROXY",
  connectionType: "INTERNET",
  integrationMethod: "POST",
  integrationUri: bookingWithDynamoDBLambda.invokeArn,
  passthroughBehavior: "WHEN_NO_MATCH",
  payloadFormatVersion: "2.0",
});
const bookingDynamoAPIRoute = new aws.apigatewayv2.Route("bookingDynamo", {
  apiId: bookingDynamoAPIGateway.id,
  routeKey: "$default",
  target: pulumi.interpolate`integrations/${bookingDynamoAPILambdaIntegration.id}`
});
export const bookingDynamoURL = stageBookingDynamo.invokeUrl

const bookingDynamoLambdaPermission = new aws.lambda.Permission("bookingDynamoLambdaPermission", {
  action: "lambda:InvokeFunction",
  function: bookingWithDynamoDBLambda.id,
  principal: "apigateway.amazonaws.com",
  sourceArn: pulumi.interpolate`${bookingDynamoAPIGateway.executionArn}/*/$default`,
});

