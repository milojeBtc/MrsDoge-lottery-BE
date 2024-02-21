const mongoose = require("mongoose");

const odiStaking = mongoose.model(
  "odiStaking",
  new mongoose.Schema({
    owner:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    stakingArr:[{
        stakingAmount: {
            type: Number,
            require: true
        },
        lockTime: {
            type: Number,
            require: true
        },
        claimDate: {
            type: Date,
            default: new Date()
        },
        stakeDate: {
            type: Date,
            default: new Date()
        },
        escrowId: {
            type: Number,
            require: true
        }
    }],
    remainReward: {
        type: Number,
        default: 0
    }
  })
);

module.exports = odiStaking;
