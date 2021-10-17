const server = require("lambda-proxy-server").createServer({
  handler: require(process.env.LAMBDA_PATH)[process.env.LAMBDA_FUNC]
});
server.listen(process.env.PROXY_PORT, function () {
  console.log("Listening on http://localhost:" + server.address().port + "/");
});