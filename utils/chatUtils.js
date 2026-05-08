/**
 * Prepares a plain message object for a specific viewer.
 * If the message's replyTo was soft-deleted (deletedFor) for the viewer,
 * the replyTo content is scrubbed so deleted text/attachments are never leaked.
 * In all cases, deletedFor is stripped from replyTo before sending to any client.
 *
 * @param {object} msgPlain - Plain JS object (from .toObject() or .lean())
 * @param {string} viewerIdStr - The viewer's user ID as a string, or a sentinel like "__no_user__"
 */
export function prepareMessageForViewer(msgPlain, viewerIdStr) {
  if (!msgPlain?.replyTo) return msgPlain;

  const replyTo = msgPlain.replyTo;
  const deletedFor = Array.isArray(replyTo.deletedFor) ? replyTo.deletedFor : [];
  const isDeletedForViewer = deletedFor.some((id) => String(id) === viewerIdStr);

  const { deletedFor: _df, ...replyToClean } = replyTo;

  return {
    ...msgPlain,
    replyTo: isDeletedForViewer
      ? { _id: replyToClean._id, sender: replyToClean.sender, message: null, attachments: [] }
      : replyToClean,
  };
}
