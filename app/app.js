var app = require("app");

var fs = require("fs");
var https = require("https");
var path = require("path");
var spawn = require("child_process").spawn;

var mkdirp = require("./vendor/mkdirp.js");
var iniParser = require("./vendor/ini.js");

var appdata = process.env["appdata"];

var toolPath = path.resolve(appdata, "gw2-pvp-log");
var filePath = path.resolve(toolPath, "logs");

function handleErrors(error) {
    if(error) {
        throw error;
    }
}

function api(endpoint, callback) {
    return https.get("https://api.guildwars2.com" + endpoint, callback);
}

function checkAndDownloadPvPData(apikey) {
    console.log("trying to update pvp logs...");
    api("/v2/pvp/games?access_token=" + apikey, function(res) {
        if(res.statusCode == HTTP_OK) {
            res.on("data", function(chunk) {
                var list = JSON.parse(chunk.toString());

                list.forEach(function(entry) {
                    var entryPath = path.resolve(filePath, entry + ".json");

                    fs.exists(entryPath, function(status) {
                        if(!status) {
                            api("/v2/pvp/games?access_token=" + apikey + "&ids=" + entry, function(res) {
                                if(res.statusCode == HTTP_OK) {
                                    res.on("data", function(chunk) {
                                        var matchDataJson = JSON.parse(chunk.toString());

                                        var matchData = JSON.stringify(matchDataJson[0], null, "\t");

                                        fs.writeFile(entryPath, matchData, function(err) {
                                            handleErrors(err);
                                            console.log("Added " + entryPath);
                                        });
                                    });
                                }
                            });
                        }
                    });
                });
            })
        }
    }).on("error", handleErrors);
}

var second = 1000;
var minute = second * 60;

var HTTP_OK = 200;

var pvplog = {
    apikey: null,
    interval: 30,
    apikeyValid: false
};

app.on("ready", function() {

    // create directory if it doesn't already exist
    mkdirp(filePath, function(err) {
        handleErrors(err);

        var iniPath = path.resolve(toolPath, "settings.ini");

        fs.exists(iniPath, function(status) {
            if(!status) {
                fs.writeFile(iniPath, "[gw2-pvp-log]\r\napikey=\r\ninterval_min=30", "utf8", function(err) {
                    handleErrors(err);

                    spawn("explorer", [iniPath]);
                });
            }

            var checkApiKey = setInterval(function() {
                fs.readFile(iniPath, "utf8", function(err, data) {
                    handleErrors(err);

                    var settings = iniParser(data);

                    var apikeySetting = settings["gw2-pvp-log"].filter(function(item) {
                        return item.name == "apikey";
                    })[0].value;

                    var intervalSetting = Number(settings["gw2-pvp-log"].filter(function(item) {
                        return item.name == "interval_min";
                    })[0].value);

                    api("/v2/tokeninfo?access_token=" + apikeySetting, function(res) {
                        if(res.statusCode == HTTP_OK) {
                            res.on("data", function(chunk) {
                                var tokeninfo = JSON.parse(chunk.toString());

                                if(tokeninfo.permissions.indexOf("pvp") > -1) {
                                    pvplog.apikey = apikeySetting;
                                    pvplog.interval = intervalSetting;
                                    pvplog.apikeyValid = true;

                                    clearInterval(checkApiKey);
                                } else {
                                    console.warn("API key: " + tokeninfo.name + " has no permission 'pvp'.");
                                }
                            })
                        } else {
                            console.warn("No valid apikey found.");
                        }
                    });
                })
            }, 5 * second);
        });

        var apikeyValidInterval = setInterval(function() {
            if(pvplog.apikeyValid) {
                console.log("API key is valid");
                clearInterval(apikeyValidInterval);

                // check once at start
                checkAndDownloadPvPData(pvplog.apikey);

                // set interval for in x minutes
                setInterval(function() {
                    checkAndDownloadPvPData(pvplog.apikey);
                }, pvplog.interval * minute);
            }
        }, 30 * second);
    });
});
