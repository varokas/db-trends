//import * as mysql from '@pulumi/mysql';
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as cloudflare from "@pulumi/cloudflare";

//https://www.pulumi.com/docs/tutorials/aws/ec2-webserver/

const range = (n:Number) => [...Array(n).keys()]

const region = "us-west-2"
const azs = ["a","b"]

const locustEC2Size = "t4g.nano";     // t2.micro is available in the AWS free tier
const arch = "arm64" //x86_64
const locustServersCount = 1

const admins = ["tawan", "pongsakorn", "thanat"]

const config = new pulumi.Config("db-trends");
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
admins.map( name => { 
  let user = new aws.iam.User(`user-${name}`, {
    path: "/admin/",
    forceDestroy: true,
  })
  const userGroupMemership = new aws.iam.UserGroupMembership(`userGroupMemership-${name}`, {
      user: user.name,
      groups: [adminGroup.name],
  })
});

//export const password = exampleUserLoginProfile.encryptedPassword;

// EIPs & DNS
// const locustIPs = range(locustServersCount).map( i => new aws.ec2.Eip(`locust-${i}`));
// const locustRecords = range(locustServersCount).map( i => new cloudflare.Record(`locust-${i}`, {
//   name: `locust-${i}`,
//   zoneId: "b52117ad37fcc6bf9077251553d7d9d8",
//   type: "A",
//   value: locustIPs[i].publicIp,
//   ttl: 3600
// }))

// Network
const dbtrendsVPC = new aws.ec2.Vpc("dbtrends", {
  cidrBlock: "10.0.0.0/16",
  tags: { Name: "dbtrends" },
});

const dbtrendsSubnets = azs.map( (az, idx) =>
  new aws.ec2.Subnet(`dbtrends-${region}${az}`, {
    vpcId: dbtrendsVPC.id,
    cidrBlock: `10.0.${idx}.0/24`,
    availabilityZone: `${region}${az}`,
    tags: { Name: `dbtrends-${region}${az}` },
  })
)

// Security Groups
const ec2SG = new aws.ec2.SecurityGroup("ec2-sg", {
  ingress: [
    { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] },
    { protocol: "tcp", fromPort: 5557, toPort: 5557, cidrBlocks: ["10.0.0.0/16"] },
  ], 
  egress: [
    { protocol: "-1", fromPort: 0, toPort: 0, cidrBlocks: ["0.0.0.0/0"] },
  ]
});

// DB 
const dbtrendsDBSubnetGroup = new aws.rds.SubnetGroup("dbtrends", {
  subnetIds: dbtrendsSubnets.map( (d) => d.id ),
  tags: {
      Name: "DBTrendsDBSubnetGroup",
  },
});


// Locust 
const ami = pulumi.output(aws.ec2.getAmi({
    filters: [
      { name: "name", values: ["amzn2-python3-*"] },
      { name: "architecture", values: [arch] } 
    ],
    owners: ["445749771569"], // varokas-chuladb
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

// const locustEIPAssocs = range(locustServersCount).map( i => new aws.ec2.EipAssociation(`eipAssoc-locust-${i}`, {
//   instanceId: locustEC2s[i].id,
//   allocationId: locustIPs[i].id,
// }))

// const rds = new aws.rds.Instance('dbtrends-rds', {
//   engine: 'mariadb',
//   username: dbUsername,
//   password: dbPassword,
//   availabilityZone: `${region}${azs[0]}`,
//   instanceClass: 'db.t4g.micro',
//   allocatedStorage: 10,
//   deletionProtection: false,
//   skipFinalSnapshot: true,

//   // For a VPC cluster, you will also need the following:
//   dbSubnetGroupName: dbtrendsDBSubnetGroup.id,
//   //vpcSecurityGroupIds: ['sg-c1c63aba'],
// });


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

const bookingLambda = new aws.lambda.Function("getBooking", {
  code: new pulumi.asset.FileArchive("../booking/server/dist/function.zip"),
  role: iamForLambda.arn,
  handler: "index.handler",
  runtime: aws.lambda.NodeJS12dXRuntime,
  environment: {
      variables: {
        DB_NAME: "bar",
        DB_HOST: "localhost",
        DB_USER: dbUsername,
        DB_PASSWORD: dbPassword,
      },
  },
});

// const bookingEndpoint = new awsx.apigateway.API("hello-world", {
//   routes: [
//     {
//       path: "/{route+}",
//       method: "ANY",
//       // Functions can be imported from other modules
//       eventHandler: bookingLambda 
//     },
//   ],
// });

///// EXPORTS /////
// export const bookingURL = bookingEndpoint.url