/*jshint esversion: 6 */
const events = require('events');
const util = require('util');

const crypto = require('./crypto');

const SMP_CID = 0x0006;

const SMP_PAIRING_REQUEST = 0x01;
const SMP_PAIRING_RESPONSE = 0x02;
const SMP_PAIRING_CONFIRM = 0x03;
const SMP_PAIRING_RANDOM = 0x04;
const SMP_PAIRING_FAILED = 0x05;
const SMP_ENCRYPT_INFO = 0x06;
const SMP_MASTER_IDENT = 0x07;
const SMP_SECURITY_REQUEST = 0x0b;

// OOB
const SMP_OOB_NO = 0x00;
const SMP_OOB_YES = 0x01;

// IO Capabilities.
const SMP_IO_DISPLAYONLY = 0x00;
const SMP_IO_DISPLAYYESNO = 0x01;
const SMP_IO_KEYBOARDONLY = 0x02;
const SMP_IO_NOINPUTNOOUTPUT = 0x03;
const SMP_IO_KEYBOARDDISPLAY = 0x04;

// Authentication types.
const SMP_AUTH_LEGACY = 0x00;
const SMP_AUTH_LESC = 0x01;

// Association Models.
const SMP_MODEL_JUSTWORKS = 0x00;
const SMP_MODEL_PASSKEY = 0x01;
const SMP_MODEL_NUMERIC = 0x02;
const SMP_MODEL_OOB = 0x03;


function bufferReverse (src) {
  var buffer = Buffer.allocUnsafe(src.length)

  for(let i=0; i<src.length; i++) {
    buffer[i] = src[src.length - i - 1];
  }

  return buffer
}

const Smp = function (localAddressType, localAddress, remoteAddressType, remoteAddress) {

  this._iat = Buffer.from([(localAddressType === 'random') ? 0x01 : 0x00]);
  this._ia = Buffer.from(localAddress.split(':').reverse().join(''), 'hex');
  this._rat = Buffer.from([(remoteAddressType === 'random') ? 0x01 : 0x00]);
  this._ra = bufferReverse(Buffer.from(remoteAddress, 'hex'));
  this._remoteAddress = remoteAddress

  this.onAclStreamDataBinded = this.onAclStreamData.bind(this);
  this.onAclStreamEndBinded = this.onAclStreamEnd.bind(this);
};

util.inherits(Smp, events.EventEmitter);

Smp.prototype.attachAclStream = function (aclStream) {
  this._aclStream = aclStream;
  this._aclStream.on('data', this.onAclStreamDataBinded);
  this._aclStream.on('end', this.onAclStreamEndBinded);
}

Smp.prototype.sendPairingRequest = function () {
  // Pairing request params
  this._preqIo= null;      // IO capabilities
  this._preqLesc = null;   // LESC capable?
  this._preqMitm = null;   // MITM protection required?
  this._preqKeySize = null // Max encryption key size
  // Pairing response params
  this._presIo= null;      // IO capabilities
  this._presLesc = null;   // LESC capable?
  this._presMitm = null;   // MITM protection required?
  // Authentication type and association model.
  this._authType = null;
  this._assocModel = null;
  // Passkey
  this._inputPasskey = null;

  this._preq = Buffer.from([
    SMP_PAIRING_REQUEST,
    this.handleLegacyPasskeyPairing ? SMP_IO_KEYBOARDONLY : SMP_IO_DISPLAYYESNO, // 0x02 = KeyboardOnly
    0x00, // OOB data: Authentication data not present
    0x01, // Authentication requirement: Bonding - No MITM
    0x10, // Max encryption key size
    0x00, // Initiator key distribution: <none>
    0x01 // Responder key distribution: EncKey
  ]);

  this.write(this._preq);
};

Smp.prototype.onAclStreamData = function (cid, data) {
  if (cid !== SMP_CID) {
    return;
  }

  const code = data.readUInt8(0);

  if (SMP_PAIRING_RESPONSE === code) {
    this.handlePairingResponse(data);
  } else if (SMP_PAIRING_CONFIRM === code) {
    this.handlePairingConfirm(data);
  } else if (SMP_PAIRING_RANDOM === code) {
    this.handlePairingRandom(data);
  } else if (SMP_PAIRING_FAILED === code) {
    this.handlePairingFailed(data);
  } else if (SMP_ENCRYPT_INFO === code) {
    this.handleEncryptInfo(data);
  } else if (SMP_MASTER_IDENT === code) {
    this.handleMasterIdent(data);
  } else if (SMP_SECURITY_REQUEST === code) {
    this.handleSecurityRequest(data);
  }else{
    console.error("unknown code", code);
  }
};

Smp.prototype.onAclStreamEnd = function () {
  this._aclStream.removeListener('data', this.onAclStreamDataBinded);
  this._aclStream.removeListener('end', this.onAclStreamEndBinded);

  this.emit('end');
};

Smp.prototype.handleSecurityRequest = function (data) {
  this.sendPairingRequest()
}

Smp.prototype.handlePairingResponse = function (data) {
  this._pres = data;

  // Determine authentication type and assocation model.
  const authMethod = this.identifyAuthenticationMethod();
  if(!authMethod){
    return
  }
  this._authType = authMethod[0];
  this._assocModel = authMethod[1];
  
  if (this._authType === SMP_AUTH_LEGACY) {
    if (this._assocModel === SMP_MODEL_JUSTWORKS) {
      this.handleLegacyJustWorksPairing(data);
    } else if (this._assocModel === SMP_MODEL_PASSKEY) {
      if(this.handleLegacyPasskeyPairing){
        this.handleLegacyPasskeyPairing(this._remoteAddress, data);
      }else{
        console.error('No implementation of handleLegacyPasskeyPairing provided.');
      }
    } else if (this._assocModel === SMP_MODEL_OOB) {
      console.error('OOB pairing not currently supported.');
    } else {
      console.error('Unexpected value for association model.');
    }
  } else if (this._authType === SMP_AUTH_LESC) {
    console.error('Support for LESC not available at present.');
  } else {
    console.error('Unexpected value for authentication type (must be either LE Legacy or LESC)');
  }
};

/* BLUETOOTH SPECIFICATION Version 5.0 | Vol 3, Part H, Section 2.3.5.1 */
Smp.prototype.identifyAuthenticationMethod = function () {
  if ((this._preq === null) || (this._pres === null)) {
    console.error('Either pairing request or pairing response is null. Cannot proceed...');
    return
  }

  // Get field values from Pairing Request.
  this._preqIo = this._preq.readUInt8(1);
  this._preqOob = this._preq.readUInt8(2);
  const preqAuthReqHex = this._preq.readUInt8(3);
  this._preqKeySize = this._preq.readUInt8(4)
  this._preqMitm = (preqAuthReqHex >> 2) & 1;
  this._preqLesc = (preqAuthReqHex >> 3) & 1;

  // Get field values from Pairing Response.
  this._presIo = this._pres.readUInt8(1);
  this._presOob = this._pres.readUInt8(2);
  const presAuthReq = this._pres.readUInt8(3);
  this._presMitm = (presAuthReq >> 2) & 1;
  this._presLesc = (presAuthReq >> 3) & 1;

  let authType = null;
  if ((this._preqLesc === 1) && (this._presLesc === 1)) {
    authType = SMP_AUTH_LESC;
  } else {
    authType = SMP_AUTH_LEGACY;
  }

  let assocModel = null;
  if (authType === SMP_AUTH_LEGACY) {
    if ((this._preqOob === SMP_OOB_YES) && (this._presOob === SMP_OOB_YES)) {
      // If both devices have OOB set, then use OOB.
      assocModel = SMP_MODEL_OOB;    
    } else if ((this._preqMitm === 0) && (this._presMitm === 0)) {
      // If neither device requires MITM protection, then use Just Works.
      assocModel = SMP_MODEL_JUSTWORKS;
    } else {
      // If either device requires MITM protection, then consider IO capabilities.
      assocModel = this.parseIoCapabilities(this._preqIo, this._presIo, authType);
    }
  } else {
    assocModel = null;
  }
  
  return [authType, assocModel];
};

Smp.prototype.parseIoCapabilities = function (reqIo, resIo, authType) {
  let ioAssocModel = null;
  if (authType === SMP_AUTH_LEGACY) {
    if ((reqIo === SMP_IO_NOINPUTNOOUTPUT) || (resIo === SMP_IO_NOINPUTNOOUTPUT)) {
      // Both devices are No Input No Output => Just Works.
      ioAssocModel = SMP_MODEL_JUSTWORKS;
    } else if ((reqIo === SMP_IO_DISPLAYONLY) && (resIo === SMP_IO_DISPLAYONLY)) {
      // Both devices are Display Only => Just Works.
      ioAssocModel = SMP_MODEL_JUSTWORKS;
    } else if ((reqIo === SMP_IO_DISPLAYYESNO) || (resIo === SMP_IO_DISPLAYYESNO)) {
      // At least one device is Display YesNo => Just Works.
      ioAssocModel = SMP_MODEL_JUSTWORKS;
    } else {
      // IO capabilities for LE Legacy result in Passkey Entry.
      ioAssocModel = SMP_MODEL_PASSKEY;
    }
  } else {
    // LESC not supported right now.
  }
  return ioAssocModel;
};

Smp.prototype.handleLegacyJustWorksPairing = function (data) {
  this._tk = Buffer.from('00000000000000000000000000000000', 'hex');
  this._r = crypto.r();

  this.write(Buffer.concat([
    Buffer.from([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]));
};

Smp.prototype._handleLegacyPasskeyPairing = function (answer) {
  this._inputPasskey = answer;
  // Convert passkey to hex.
  const passkeyBuffer = Buffer.alloc(16,0);
  passkeyBuffer.writeUInt32LE(Number(this._inputPasskey), 0);
  
  this._tk = Buffer.from(passkeyBuffer);
  this._r = crypto.r();

  this.write(Buffer.concat([
    Buffer.from([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, this._r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]));
}
 
Smp.prototype.handlePairingConfirm = function (data) {
  this._pcnf = data;

  this.write(Buffer.concat([
    Buffer.from([SMP_PAIRING_RANDOM]),
    this._r
  ]));
};

Smp.prototype.handlePairingRandom = function (data) {
  const r = data.slice(1);

  const pcnf = Buffer.concat([
    Buffer.from([SMP_PAIRING_CONFIRM]),
    crypto.c1(this._tk, r, this._pres, this._preq, this._iat, this._ia, this._rat, this._ra)
  ]);

  if (this._pcnf.toString('hex') === pcnf.toString('hex')) {
    let stk = crypto.s1(this._tk, r, this._r);

    // Perform key masking if needed.
    var stkString = stk.toString('hex');
    var keySizeString = this._preqKeySize.toString(10);
    if (keySizeString < 16) {
        var zeroStk = Buffer.alloc(16-keySizeString);
        var cutStk = stk.slice(0,keySizeString);
        var newStk = Buffer.concat([cutStk,zeroStk], 16)
        stk = newStk;
    }
    //console.log('[SMP] STK before masking ' + stkString);
    //console.log('[SMP] Key size ' + keySizeString);
    stkString = stk.toString('hex');
    //console.log('[SMP] STK after masking ' + stkString);

    this.emit('stk', stk);
  } else {
    this.write(Buffer.from([
      SMP_PAIRING_RANDOM,
      SMP_PAIRING_CONFIRM
    ]));

    this.emit('fail');
  }
};

Smp.prototype.handlePairingFailed = function (data) {
  const reason = data[1]
  if(reason == 3 && this._attemptedFailedPairingRecovery){
    this.sendPairingRequest();
    this._attemptedFailedPairingRecovery = true
  }
};

Smp.prototype.handleEncryptInfo = function (data) {
  let ltk = data.slice(1);

  // Perform key masking if needed.
  var ltkString = ltk.toString('hex');
  var keySizeString = this._preqKeySize.toString(10);
  if (keySizeString < 16) {
      var zeroltk = Buffer.alloc(16-keySizeString);
      var cutltk = ltk.slice(0,keySizeString);
      var newltk = Buffer.concat([cutltk,zeroltk], 16)
      ltk = newltk;
  }
  
  this.emit('ltk', ltk);
};

Smp.prototype.handleMasterIdent = function (data) {
  const ediv = data.slice(1, 3);
  const rand = data.slice(3);

  this.emit('masterIdent', ediv, rand);
};

Smp.prototype.write = function (data) {
  this._aclStream.write(SMP_CID, data);
};

module.exports = Smp;
