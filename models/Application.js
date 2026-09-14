const mongoose=require("mongoose");
const ApplicationSchema=new mongoose.Schema({
    company:String,
    role:String,
    deadline:String,
    status:String
});
    module.exports=mongoose.model("Application",ApplicationSchema);
