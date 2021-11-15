import { Connection } from "mariadb";

import * as _ from "lodash"
import * as fs from 'fs';
import * as mariadb from 'mariadb'

export interface DB {
    newRound(newRoundId: string, codes: string[]):Promise<void> 
    getCurrentRound(): Promise<string>
  
    makeBookings(round: string, bookings: DBBooking[]):Promise<DBMakeBookingResult[]>
    
    getBookings(round: string): Promise<DBBookingResult[]>
    getBooked(round: string): Promise<DBBookingResult[]>
    getOwners(round: string): Promise<DBOwnerResult[]>
    
  }

export interface DBConfig {
    k: string
    v: string
}

export interface DBBooking {
  seat: string
  owner: string
  counter: number
}

export interface DBBookingResult {
  id?: number
  round: string
  seat: string
  owner?: string
  counter?: number
}

export interface DBOwnerResult {
  counts: number
  owner: string
}

export interface DBMakeBookingResult {
  round: string
  seat: string
  owner?: string
  counter?: number
  newCounter: number
  error?: string
}
  

export class MysqlDB implements DB {
  constructor() {
    // Create Tables (not forced sync)
    fs.promises.readFile("create_tables.sql", 'utf8')
    .then(createTable => this.#executeQuery(createTable))
    .then( i => console.log("Create Table SQL executed") )
    .catch(err => console.log(err))
  }

  async makeBookings(round: string, bookings: DBBooking[]): Promise<DBMakeBookingResult[]> {
    const seats = bookings.map( b => b.seat )
    const reqBySeats = _.groupBy(bookings, r => r.seat)

    return await this.#execute(async (conn) => {
    const bookingSeats = await conn.query("SELECT * FROM booking WHERE round = ? AND seat IN (?) FOR UPDATE", [round, seats])
    const bookingsBySeat = _.groupBy(bookingSeats, r => r.seat)
    const seatNotExist = _.difference(seats, Object.keys(bookingsBySeat))

    if (seatNotExist.length > 0) {
        throw new Error(`Seats not exists. Round: ${round}, Seats: ${seatNotExist}`)
    }

    var result = [];
    for (const seatIdx in seats) {
        const seat = seats[seatIdx]
        const owner = reqBySeats[seat][0].owner
        const newCounter = reqBySeats[seat][0].counter

        var counter = bookingsBySeat[seat][0].counter
        if (counter == null || counter < newCounter) {
        await conn.query("UPDATE booking SET owner=?, counter=? WHERE round = ? AND seat = ?", [owner, newCounter, round, seat])
        result.push({round, seat, owner, counter, newCounter})
        } else {
        result.push({
            "error": "Cannot take over seat",
            round, seat, counter, owner, newCounter
        })
        }
    }

    return result;
    })
  }

  async newRound(newRoundId: string, codes: string[]):Promise<void> {
    var insertParams = _.zip(Array(codes.length).fill(newRoundId), codes)
    await this.#execute(async (conn) => {
    await conn.query(`REPLACE INTO config(k,v) VALUES ('round','${newRoundId}')`)
    await conn.batch("INSERT INTO booking(round, seat) VALUES (?, ?)", insertParams)
    })
  }

  async getCurrentRound(): Promise<string> {
    var roundResult:DBConfig[] = await this.#executeQuery("SELECT * FROM config where k = 'round'")
    if (roundResult.length == 0) {
      throw new Error("No current round")
    }

    return roundResult[0]["v"] 
  }

  async getBookings(round: string): Promise<DBBookingResult[]> {
    return await this.#executeQuery("SELECT * FROM booking WHERE round = ?", [round])
  }

  async getBooked(round: string): Promise<DBBookingResult[]> {
    return await this.#executeQuery("SELECT * FROM booking WHERE round = ? AND owner IS NOT NULL", [round])
  }

  async getOwners(round: string): Promise<any[]> {
    return await this.#executeQuery("SELECT COUNT(counter) AS counts, owner FROM booking WHERE round = ? AND owner IS NOT NULL GROUP BY owner ORDER BY COUNT(counter) DESC", [round])
  }

  async #executeQuery(query:string, params?: [string]): Promise<any> {
    return this.#execute(async (conn:Connection) => conn.query(query, params))
  }

  async #execute(command: (c: Connection) => Promise<any>) {
    let conn;
    let result;

    try {
    conn = await mariadb.createConnection({
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true
    })

    await conn.beginTransaction();
    try {
        result = await command(conn);
        await conn.commit();
    } catch (err) {
        console.error("Error executing, reverting changes: ", err);
        await conn.rollback();
        throw err;
    }
    } catch (error) {
    console.log(error);
    throw error;
    } finally {
    if (conn) {
        await conn.end()
    }
    }

    return result;
  }
}
  
import AWS from 'aws-sdk';

export class DynamoDB implements DB {
  dynamodb: AWS.DynamoDB;
  docClient: AWS.DynamoDB.DocumentClient;

  constructor(region: string, endpoint?: string) {
    AWS.config.update({region})

    if (endpoint) {
      this.dynamodb = new AWS.DynamoDB({endpoint})
      this.docClient = new AWS.DynamoDB.DocumentClient({endpoint})
    } else {
      this.dynamodb = new AWS.DynamoDB()
      this.docClient = new AWS.DynamoDB.DocumentClient()
    }

    // WARNING: below does not block...
    this.createTablesIfNotExists()
      .then( t => console.log("DynamoDB Table created") )
      .catch( ex => console.log(ex) )
  }

  private async createTablesIfNotExists() {
    const tables = await this.dynamodb.listTables({}).promise()
    const tableNames = new Set(tables.TableNames)

    console.log(`Found DynamoDB Tables: ${tables.TableNames}`)
    
    const createTablePromises:Promise<AWS.DynamoDB.Types.CreateTableOutput>[] = []
    if (!tableNames.has("Config")) {
      console.log("Createing Config Table")
      createTablePromises.push(
        this.dynamodb.createTable({
          TableName : "Config",
          KeySchema: [       
              { AttributeName: "key", KeyType: "HASH"},
          ],
          AttributeDefinitions: [       
              { AttributeName: "key", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
        }).promise()
      )
    }
    if(!tableNames.has("Booking")) {
      // Table Schema
      // pk: seat - Hopefully properly distributed by nature
      // sk: round_id
      // value: {user:count}
      // seat: [round_id]#[seat_id] - We treat round like version here. This will allow us to query by user, round easily
      console.log("Createing Booking Table")
      createTablePromises.push(
        this.dynamodb.createTable({
          TableName : "Booking",
          KeySchema: [       
              { AttributeName: "Seat", KeyType: "HASH" },
              { AttributeName: "Round", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
              { AttributeName: "Seat", AttributeType: "S" },
              { AttributeName: "Round", AttributeType: "S" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          GlobalSecondaryIndexes: [
            {
              IndexName: 'RoundIndex',
              KeySchema: [
                { KeyType: "HASH", AttributeName: "Round" },
                { KeyType: "RANGE", AttributeName: "Seat" }
              ],
              Projection: {
                ProjectionType: "ALL"
              },
            }
          ]
        }).promise()
      )
    }
    return Promise.all(createTablePromises)
  }

  async newRound(newRoundId: string, codes: string[]): Promise<void> {
    // Create New Round
    await this.docClient.put({
      TableName: "Config",
      Item: {"key": "round", "value": newRoundId}
    }).promise()

    const batchWritePromises:Promise<AWS.DynamoDB.Types.BatchWriteItemOutput>[] = []
    // DynamoDB doesn't like too big batch (~25 put)
    const chunkCodes = _.chunk(codes, 20)
    chunkCodes.forEach(codeSubset => {
      const params = {
        RequestItems: {
          "Booking": codeSubset.map(code => {
            return {
              PutRequest: {
                Item: {
                  "Seat": code,
                  "Round": newRoundId,
                  "ReservationCounter": 0
                }
              }
            }
          })
        }
      }
      batchWritePromises.push(this.docClient.batchWrite(params).promise())
    })
    // TODO - Handle Unprocessed Items
    Promise.all(batchWritePromises)
    .then(res => console.log(`New Round Response ${JSON.stringify(res)}`))
    .catch(ex => console.error(`ERROR: ${ex}`))
  }

  async getCurrentRound(): Promise<string> {
    // Get Current Round ID
    const data = await this.docClient.get({
      TableName: "Config",
      Key: {"key": "round"}
    }).promise()

    if (!data.Item) {
      console.error("No Current Round Found")
      throw new Error("No current round")
    }

    return data.Item["value"]
  }

  
  async makeBookings(round: string, bookings: DBBooking[]): Promise<DBMakeBookingResult[]> {
    // Update Seat in the round with the owner if the counter value is highest for the owner
    const batchGetParams = {
      RequestItems: {
        "Booking": {
          Keys: bookings.map(booking => ({"Seat": booking.seat, "Round": round}))
        }
      }
    }
    const data = await this.docClient.batchGet(batchGetParams).promise()
    const currentBookingBySeat = _.keyBy(data.Responses?.Booking, b => b.Seat)
    const batchUpdateItems: AWS.DynamoDB.PutRequest[] = []
    // Dynamo Put won't get us any updated output - ref https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html#DDB-PutItem-request-ReturnValues
    const makeBookingResult: DBMakeBookingResult[] = []
    bookings.forEach(booking => {
      const currentBooking = currentBookingBySeat[booking.seat]
      if(!currentBooking.SeatOwner || booking.counter > currentBooking.ReservationCounter) {
        const item = <AWS.DynamoDB.PutRequest>{
            Item: {
              "Seat": booking.seat,
              "Round": round,
              "SeatOwner": booking.owner,
              "ReservationCounter": booking.counter
            }
          }
        batchUpdateItems.push(item)
        makeBookingResult.push({
          round: round,
          seat: booking.seat,
          owner: booking.owner,
          counter: currentBooking.ReservationCounter || 0,
          newCounter: booking.counter
        })
      }
    })

    const batchWritePromises:Promise<AWS.DynamoDB.Types.BatchWriteItemOutput>[] = []
    // DynamoDB doesn't like too big batch (~25 put)
    const chunkCodes = _.chunk(batchUpdateItems, 20)
    chunkCodes.forEach(chunk => {
      const params = {
        RequestItems: {
          "Booking": chunk.map(putReqItem => ({PutRequest: putReqItem}))
        },
      }
      batchWritePromises.push(this.docClient.batchWrite(params).promise())
    })
    // TODO - Handle Unprocessed Items
    Promise.all(batchWritePromises)
    .then(res => console.log(`Response ${JSON.stringify(res)}`))
    .catch(ex => console.error(`ERROR: ${ex}`))
    return makeBookingResult
  }
  async getBookings(round: string): Promise<DBBookingResult[]> {
    // Get All Bookings By Round
    const params = {
      TableName : "Booking",
      IndexName: "RoundIndex",
      KeyConditionExpression: "Round = :round_value",
      ExpressionAttributeValues: {
          ":round_value": round
      }
    }
    const data = await this.docClient.query(params).promise()
    if (!data.Items) {
      throw new Error("Data Not Found");
      console.error(`No Data Found for getBookings. Params ${JSON.stringify(params)}`)
    }

    const output = data.Items.map(item => <DBBookingResult>{
      round: item.Round,
      seat: item.Seat,
      owner: item.SeatOwner ||  "",
      counter: item.ReservationCounter || 0,
    })
    return output
  }
  async getBooked(round: string): Promise<DBBookingResult[]> {
    // Get all booked seat in the round
    const params = {
      TableName : "Booking",
      IndexName: "RoundIndex",
      KeyConditionExpression: "Round = :round_value",
      FilterExpression: "attribute_exists(SeatOwner)",
      ExpressionAttributeValues: {
          ":round_value": round
      }
    }
    const data = await this.docClient.query(params).promise()
    if (!data.Items) {
      console.error(`No Data Found for getBooked. Params ${JSON.stringify(params)}`)
      throw new Error("Data Not Found");
    }
    const output = data.Items.map(item => <DBBookingResult>{
      round: item.Round,
      seat: item.Seat,
      owner: item.SeatOwner,
      counter: item.ReservationCounter,
    })
    return output
  }

  async getOwners(round: string): Promise<DBOwnerResult[]> {
    // Get count by owner
    // Scan by Round
    const bookedSeat = await this.getBooked(round)
    // Group By Owner
    const countByOwner = _.countBy(bookedSeat, item => item.owner)
    const result: DBOwnerResult[] = []
    _.forIn(countByOwner, (counts, owner) => result.push({ owner, counts }));
    // const _.forIn(countByOwner, (count, owner) => result.push({ owner, counter: count }));
    return _.sortBy(result, r => -r.counts)
  }
}
