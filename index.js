var request = require('request'),
  fs = require('fs'),
  SimpleTokenClient = require('simple-token-client'),
  os = require('os'),
  pathUtil = require('path'),
  uuid = require('node-uuid');

function StorageApi (config) {
  this.config = config;
  this.downloadDir = os.tmpdir();
  this.tokenClient = new SimpleTokenClient(config);
}

function jsonResponseHandler (done) {
  return function (err, res, body) {
    if(err) {
      return done(err);
    }

    try {
      body = JSON.parse(body) || body;
    }
    catch (ex) {
      return done(new Error('response is not json'));
    }
    if(res.statusCode !== 200) {
      err = new Error(body.errmsg);
      err.code = body.errcode;
      return done(err);
    }
    done(null, body);
  };
}

function postFile (url, options, formData, files, done) {
  var opts = {
    url: url,
    proxy: false
  };
  opts = _.merge(opts, options);

  var req = request['post'](opts, jsonResponseHandler(done));
  var form = req.form();
  _.each(formData, function (val, key) {
    form.append(key, val);
  });
  _.each(files, function (val, key) {
    form.append(key, fs.createReadStream(val.path), {filename: val.filename});
  });
}

StorageApi.prototype.uploadFile = function (bucket, path, file, done) {
  var self = this;
  self.tokenClient.getToken(function (err, token) {
    if(err) {
      return done(new Error('failed to get access token:' + err.message));
    }
    postFile(self.config.endpoint + '/api/v1/file',
      {
        headers : {
          Authorization: 'Bearer ' + token
        }
      },
      {
        bucket: bucket,
        path: path
      },
      {
        file: {
          path: file.path,
          filename: file.originalFilename
        }
      },
      done);
  });
};

var filenamePattern = /filename=\"(.*)\"/gi;

StorageApi.prototype.downloadFile = function (url, done) {
  var self = this;

  self.tokenClient.getToken(function (err, token) {
    if(err) {
      return done(new Error('failed to get access token:' + err.message));
    }
    request({
      url: url,
      headers: {
        Authorization: 'Bearer ' + token
      }
    }).on('response', function (res) {
      if(res.statusCode !== 200) {
        return done(new Error('download file get status:' + res.statusCode));
      }

      var contentDisposition = res.headers['content-disposition'];
      var filename = contentDisposition ? (filenamePattern.exec(contentDisposition) || [])[1] : '';
      var extname = pathUtil.extname(filename || '');
      var saveAs = pathUtil.join(self.downloadDir, uuid.v4() + extname);
      var writeStream = fs.createWriteStream(saveAs);
      res.pipe(writeStream);

      writeStream
      .on('finish', function () {
        done(null, saveAs);
      })
      .on('error', done);
    })
    .on('error', done);
  });
};

module.exports = StorageApi;
