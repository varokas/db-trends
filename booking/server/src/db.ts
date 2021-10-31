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
  id: number
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
    
    return Promise.all(createTablePromises)
  }

  async newRound(newRoundId: string, codes: string[]): Promise<void> {
    await this.docClient.put({
      TableName: "Config",
      Item: {"key": "round", "value": newRoundId}
    }).promise()
  }
  async getCurrentRound(): Promise<string> {
    const data = await this.docClient.get({
      TableName: "Config",
      Key: {"key": "round"}
    }).promise()

    if (data.Item) {
      console.log(data.Item)
      return data.Item["value"]
    }

    return "unknown"
  }
  makeBookings(round: string, bookings: DBBooking[]): Promise<DBMakeBookingResult[]> {
    throw new Error("Method not implemented.");
  }
  getBookings(round: string): Promise<DBBookingResult[]> {
    throw new Error("Method not implemented.");
  }
  getBooked(round: string): Promise<DBBookingResult[]> {
    throw new Error("Method not implemented.");
  }
  getOwners(round: string): Promise<DBOwnerResult[]> {
    throw new Error("Method not implemented.");
  }

}