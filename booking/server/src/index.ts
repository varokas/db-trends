///////// IMPORTS ////////////
import * as _ from "lodash"
import { nanoid } from 'nanoid'

import createAPI from 'lambda-api';

import { Context, APIGatewayEvent } from "aws-lambda";
import { MysqlDB, DB, DynamoDB } from "./db"

///////// VARIABLES ////////////
var rows = 10
var cols = 10

const dbType = process.env.DB_TYPE 
console.log(`dbType: ${dbType}`)

var db:DB
if(dbType == "dynamodb-local") {
   db = new DynamoDB("us-west-2", "http://dynamodb:8000")
} else {
   db = new MysqlDB()
}

///////// ROUTES ////////////
const api = createAPI()

api.get('/api/booking', async (req, res) => {
  var round = await db.getCurrentRound()

  return db.getBookings(round)
});

api.get('/api/booking/booked', async (req, res) => {
  var round = await db.getCurrentRound()

  return db.getBooked(round)
});

api.get('/api/booking/owners', async (req, res) => {
  var round = await db.getCurrentRound()

  return db.getOwners(round)
});

interface Booking {
  seat: string
  owner: string
  counter: number
}
api.post('/api/makeBooking', async (req, res) => {
  var round = await db.getCurrentRound()

  const bookings:Booking[] = [req.body]

  return db.makeBookings(round, bookings)
});
api.post('/api/makeBookings', async (req, res) => {
  var round = await db.getCurrentRound()

  const bookings:Booking[] = req.body

  return db.makeBookings(round, bookings)
});

api.post('/api/newRound', async (req, res) => {
  interface Request {
    rows: number
    cols: number
  }
  const reqBody: Request | undefined = req.body
  
  const rowBody = reqBody?.rows 
  const colBody = reqBody?.cols

  if (rowBody) {
    rows = rowBody
  }
  
  if (colBody) {
    cols = colBody
  }
 
  const newId = nanoid(10)

  var rowCodes = _.range(rows).map(i => String.fromCharCode(65 + i))
  var colCodes = _.range(cols)

  var codes = rowCodes.flatMap(r => colCodes.map(c => `${r}${c.toString().padStart(4, '0')}`))

  await db.newRound(newId, codes)

  return { "roundId": newId, "seats": codes.length }
});


api.get('/:p', async (req, res) => {
  if (!req.params.p) {
    res.sendFile("static/index.html")
  }

  res.sendFile(`static/${req.params.p}`)
});

/// DB Interface ///

// Lambda Handler
exports.handler = async (event:APIGatewayEvent, context:Context) => {
  return await api.run(event, context);
};

///////// DB Helpers ////////////

