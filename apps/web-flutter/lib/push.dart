import 'dart:convert';
import 'dart:js_interop';

import 'api.dart';

@JS('hoyEnablePush')
external JSPromise<JSString> _hoyEnablePush(JSString publicKey);

Future<void> enablePush(Api api) async {
  final publicKey = await api.vapid();
  try {
    final raw = (await _hoyEnablePush(publicKey.toJS).toDart).toDart;
    final data = jsonDecode(raw) as Map<String, dynamic>;
    await api.savePush(data['endpoint'] as String, data['p256dh'] as String, data['auth'] as String);
  } catch (err) {
    final message = '$err'.replaceFirst(RegExp(r'^Error:\s*'), '');
    throw ApiException(message);
  }
}
