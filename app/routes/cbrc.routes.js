const { authJwt } = require("../middlewares");
const controller = require("../controllers/staking.controller");

module.exports = function(app) {

  app.post("/api/cbrc/staking", controller.staking);
  app.post("/api/cbrc/unstaking", controller.unstaking);
  app.get("/api/cbrc/getUserInfo", controller.getUserInfo);
  app.post("/api/cbrc/claimReward", controller.claimReward);
  app.post("/api/cbrc/checkPotentialReward", controller.checkPotentialReward);
  app.post("/api/cbrc/unstakingDB", controller.unstakingDB);
  app.post("/api/cbrc/sendInscription", controller.sendInscription);
  app.post("/api/cbrc/sendBTC", controller.sendBTC);
  app.post("/api/cbrc/transferInscribe", controller.transferInscribe);
  app.post("/api/cbrc/getInscribeId", controller.getInscribeId);
  app.post("/api/cbrc/getUtxoId", controller.getUtxoId)
  app.post("/api/cbrc/getAddressInscriptions", controller.getAddressInscriptions)

  app.post("/api/cbrc/cbrcStaking", controller.cbrcStaking)
  app.post("/api/cbrc/cbrcClaimReward", controller.cbrcClaimReward)
  app.post("/api/cbrc/cbrcCheckPotentialReward", controller.cbrcCheckPotentialReward)
  app.post("/api/cbrc/cbrcUnstaking", controller.cbrcUnstaking);
  app.post("/api/cbrc/cbrcUnstakingDB", controller.cbrcUnstakingDB)
  
};
