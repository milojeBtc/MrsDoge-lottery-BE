const mongoose = require("mongoose");

const xODIStaking = mongoose.model(
  "xODIStaking",
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
        inscribeId: {
            type: String,
            require: true
        }
    }],
    remainReward: {
        type: Number,
        default: 0
    }
  })
);

module.exports = xODIStaking;
