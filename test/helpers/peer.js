const {getRandomDocumentPositionAndExtent, buildRandomLines} = require('./random')
const {ZERO_POINT, compare} = require('../../lib/point-helpers')
const Document = require('./document')
const DocumentReplica = require('../../lib/document-replica')

module.exports =
class Peer {
  static buildNetwork (n, text) {
    const peers = []
    for (var i = 0; i < n; i++) {
      peers.push(new Peer(i + 1, text))
    }

    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (i !== j) peers[i].connect(peers[j])
      }
    }

    return peers
  }

  constructor (siteId, text) {
    this.siteId = siteId
    this.outboxes = new Map()
    this.document = new Document(text)
    this.documentReplica = new DocumentReplica(siteId)
    this.deferredOperations = []
    this.history = []
  }

  connect (peer) {
    this.outboxes.set(peer, [])
  }

  send (operation) {
    this.outboxes.forEach((outbox) => outbox.push(operation))
  }

  receive (operation) {
    this.log('Received', operation)
    const opsToApply = this.documentReplica.applyRemote(operation)
    this.log('Applying', opsToApply)
    this.document.applyMany(opsToApply)
    this.log('Text', this.document.text)
    this.history.push(operation)
  }

  isOutboxEmpty () {
    return Array.from(this.outboxes.values()).every((o) => o.length === 0)
  }

  performRandomEdit (random) {
    const {position, extent} = getRandomDocumentPositionAndExtent(random, this.document)
    let operation
    if (random(2) < 1 && compare(extent, ZERO_POINT) > 0) {
      operation = {type: 'delete', position, extent}
    } else {
      operation = {type: 'insert', position, text: buildRandomLines(random, 3)}
    }

    this.document.apply(operation)
    this.log('Generating', operation)
    const operationToSend = this.documentReplica.applyLocal(operation)
    this.send(operationToSend)
    this.log('Text', this.document.text)
    this.history.push(operationToSend)
  }

  undoRandomOperation (random) {
    const opToUndo = this.history[random(this.history.length)]
    if (this.documentReplica.hasAppliedOperation(opToUndo.opId)) {
      this.log('Undoing', opToUndo)
      const {opsToApply, opToSend} = this.documentReplica.undoLocal(opToUndo.opId)
      this.log('Applying', opsToApply)
      this.document.applyMany(opsToApply)
      this.log('Text', this.document.text)
      this.send(opToSend)
    }
  }

  deliverRandomOperation (random) {
    const outboxes = Array.from(this.outboxes).filter(([peer, operations]) => operations.length > 0)
    const [peer, operations] = outboxes[random(outboxes.length)]
    peer.receive(operations.shift())
  }

  log (...message) {
    if (global.enableLog) {
      console.log(`Site ${this.siteId}`, ...message)
    }
  }
}
