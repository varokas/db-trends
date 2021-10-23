///////// VARIABLES ////////////
rows = 10
cols = 10

///////// IMPORTS ////////////
const fs = require('fs').promises
const mariadb = require('mariadb');
const _ = require('lodash');
const { nanoid } = require('nanoid')


const api = require('lambda-api')();

// Create Tables (not forced sync)
fs.readFile("create_tables.sql", 'utf8')
  .then(createTable => executeQuery(createTable))
  .catch(err => console.log(err))

///////// ROUTES ////////////
api.get('/api/booking', async (req, res) => {
  var round = await getCurrentRound()

  return await executeQuery("SELECT * FROM booking WHERE round = ?", [round])
});

api.get('/api/booking/booked', async (req, res) => {
  var round = await getCurrentRound()

  return await executeQuery("SELECT * FROM booking WHERE round = ? AND owner IS NOT NULL", [round])
});

api.get('/api/booking/owners', async (req, res) => {
  var round = await getCurrentRound()

  return await executeQuery("SELECT SUM(counter) AS counts, owner FROM booking WHERE round = ? AND owner IS NOT NULL GROUP BY owner ORDER BY SUM(counter) DESC", [round])
});

api.get('/:p', async (req, res) => {
  if (!req.params.p) {
    res.sendFile("dist/static/index.html")
  }

  res.sendFile(`dist/static/${req.params.p}`)
});


/*
 {
  "seat": "A0001",
  "name": "abc",
  "counter": 5
} 
 */
api.post('/api/makeBooking', async (req, res) => {
  var round = await getCurrentRound()

  const seat = req.body.seat
  const name = req.body.owner
  const newCounter = req.body.counter

  result = await execute(async (conn) => {
    const bookingSeats = await conn.query("SELECT * FROM booking WHERE round = ? AND seat IN (?) FOR UPDATE", [round, [seat]])
    const bookingsBySeat = _.groupBy(bookingSeats, r => r.seat)
    const seatNotExist = _.difference([seat], Object.keys(bookingsBySeat))

    if (seatNotExist.length > 0) {
      throw new Error(`Seats not exists. Round: ${round}, Seat: ${seat}`)
    }

    var counter = bookingsBySeat[seat][0].counter
    if (counter == null || counter < newCounter) {
      await conn.query("UPDATE booking SET owner=?, counter=? WHERE round = ? AND seat = ?", [name, newCounter, round, seat])
      return {
        round, seat, counter, newCounter
      }
    } else {
      return {
        "error": "Cannot take over seat",
        round, seat, counter, newCounter
      }
    }
  });

  if (result.error) {
    return res.status(400).send(result)
  }

  return result
});

api.post('/api/newRound', async (req, res) => {
  const newId = nanoid(10)

  var rowCodes = _.range(rows).map(i => String.fromCharCode(65 + i))
  var colCodes = _.range(cols)

  var codes = rowCodes.flatMap(r => colCodes.map(c => `${r}${c.toString().padStart(4, '0')}`))
  var insertParams = _.zip(Array(codes.length).fill(newId), codes)

  await execute(async (conn) => {
    await conn.query(`REPLACE INTO config(k,v) VALUES ('round','${newId}')`)
    await conn.batch("INSERT INTO booking(round, seat) VALUES (?, ?)", insertParams)
  })

  return { "roundId": newId, "seats": codes.length }
});

// Lambda Handler
exports.handler = async (event, context) => {
  return await api.run(event, context);
};

///////// DB Helpers ////////////
async function getCurrentRound() {
  var roundResult = await executeQuery("SELECT * FROM config where k = 'round'")
  if (roundResult.length == 0) {
    throw new Error("No current round")
  }

  return roundResult[0]["v"]
}

async function executeQuery(query, params) {
  return execute(async (conn) => conn.query(query, params))
}

async function execute(command) {
  let conn;
  let result;

  try {
    const conn = await mariadb.createConnection({
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
  } catch(error) { 
    console.log(error);
    throw error;
  } finally {
    if (conn) connconn.end()
  }

  return result;
}
