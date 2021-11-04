# Booking

## Prerequisite
```
brew install awscli
brew install node
```
* https://www.docker.com/products/docker-desktop

## Server
```
cd booking/server
npm install
docker-compose up
```

* Nodemon is used to monitor any changes in /server directory and reload when necessary.
* Keep the server running while develop client

### Server APIs
Before doing anything we need to create a new 'round' first. 

```
$ curl -d "rows=10&cols=10" -X POST localhost:3000/api/newRound
{"roundId":"xDR31zsiQc","seats":100}
```

Make Booking
```
$ curl --request POST \
  --url http://localhost:3000/api/makeBooking \
  --header 'Content-Type: application/json' \
  --data '{
	"seat": "A0002",
	"name": "vp",
	"counter": 3
}'
{"round":"xDR31zsiQc","seat":"A0002","counter":null,"newCounter":3}

### This returns error if condition is not met
{"error":"Cannot take over seat","round":"xDR31zsiQc","seat":"A0002","counter":3,"newCounter":3}
```

Query Endpoints
```
# Booking by owners, sorted by total count 

$ curl localhost:3000/api/booking/owners
[{"counts":3,"owner":"vp"}]

# List all bookings
$ curl localhost:3000/api/booking
[{"id":1,"round":"xDR31zsiQc","seat":"A0000","owner":null,"counter":null,"updated":null}, ...

# List all bookings with owner (for debug)
$ curl localhost:3000/api/booking/booked
[{"id":3,"round":"xDR31zsiQc","seat":"A0002","owner":"vp","counter":3,"updated":null}]
```
No Xcode or CLT version detected

## Client

### Prerequisite
```
$ cd booking/client
$ npm install
```

If there's an error `gyp: No Xcode or CLT version `. 
Follow these - https://anansewaa.com/gyp-no-xcode-or-clt-version-detected-macos-catalina/

### Run 
```
$ npm run dev
```

Parcel is also set to proxies `http://localhost:1234/api` to `http://localhost:3000/api`

### Database Debug
```
ssh -i ~/.ssh/dbtrends -L 3306:dbtrends-rdsb86fe29.c6qgv553r5pq.us-west-2.rds.amazonaws.com:3306 ec2-user@redis-demo.varokas.com
```

### Locust
```
$ cd locust
$ python -m venv .venv
$ source .venv/bin/activate 
```