const { authJwt } = require("../middlewares");
const controller = require("../controllers/deepLake.controller");

module.exports = function(app) {

  app.post("/api/dl/createEscrow", controller.createEscrow);
  app.post("/api/dl/signAndBroadcast", controller.signAndBroadcast);
  app.post("/api/dl/unlock", controller.unlock);
  app.post("/api/dl/unlockBroadcasting", controller.unlockBroadcasting);
  app.post("/api/dl/getUtxoByInscriptionId", controller.getUtxoByInscriptionId);
  // app.get("/api/dl/getUtxoByInscriptionId", (req, res) => {
  //   res.send(true);
  // });
};
