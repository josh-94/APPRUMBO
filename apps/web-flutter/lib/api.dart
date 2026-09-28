import 'dart:convert';

import 'package:http/http.dart' as http;

import 'client.dart';
import 'models.dart';

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class Api {
  Api() : _client = createClient();

  final http.Client _client;

  Future<Map<String, dynamic>> session() => _send('GET', '/api/session');

  Future<void> login(String email, String password) {
    return _send('POST', '/api/session', {'email': email, 'password': password});
  }

  Future<void> register(String email, String password) {
    return _send('POST', '/api/register', {'email': email, 'password': password});
  }

  Future<void> logout() => _send('DELETE', '/api/session');

  Future<List<TaskList>> lists() async {
    final data = await _send('GET', '/api/lists');
    return (data['lists'] as List<dynamic>).map((item) => TaskList.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<TaskList> createList(String name) async {
    final data = await _send('POST', '/api/lists', {'name': name});
    return TaskList.fromJson(data);
  }

  Future<List<Task>> tasks(String query) async {
    final data = await _send('GET', '/api/tasks?$query');
    return (data['tasks'] as List<dynamic>).map((item) => Task.fromJson(item as Map<String, dynamic>)).toList();
  }

  Future<Task> task(int id) async {
    final data = await _send('GET', '/api/tasks/$id');
    return Task.fromJson(data);
  }

  Future<Task> createTask(TaskInput input) async {
    final data = await _send('POST', '/api/tasks', input.toJson());
    return Task.fromJson(data);
  }

  Future<Task> updateTask(int id, TaskInput input) async {
    final data = await _send('PATCH', '/api/tasks/$id', input.toJson());
    return Task.fromJson(data);
  }

  Future<void> deleteTask(int id) => _send('DELETE', '/api/tasks/$id');

  Future<Task> done(int id) async => Task.fromJson(await _send('POST', '/api/tasks/$id/done'));

  Future<Task> today(int id) async => Task.fromJson(await _send('POST', '/api/tasks/$id/today'));

  Future<Task> later(int id, String dueAt) async {
    return Task.fromJson(await _send('POST', '/api/tasks/$id/later', {'dueAt': dueAt}));
  }

  Future<void> reorder(int listId, List<int> taskIds) {
    return _send('POST', '/api/lists/$listId/order', {'taskIds': taskIds});
  }

  Future<String> vapid() async {
    final data = await _send('GET', '/api/push/vapid');
    return data['publicKey'] as String;
  }

  Future<void> savePush(String endpoint, String p256dh, String auth) {
    return _send('POST', '/api/push/subscriptions', {
      'endpoint': endpoint,
      'keys': {'p256dh': p256dh, 'auth': auth},
    });
  }

  Future<Map<String, dynamic>> _send(String method, String path, [Object? body]) async {
    final request = http.Request(method, Uri.base.resolve(path));
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final response = await _client.send(request);
    if (response.statusCode == 401) {
      throw ApiException('Necesitas entrar');
    }
    final text = await response.stream.bytesToString();
    if (response.statusCode == 204 || text.isEmpty) return {};
    final data = jsonDecode(text);
    if (response.statusCode >= 300) {
      final message = data is Map && data['error'] is String ? data['error'] as String : 'No se pudo completar';
      throw ApiException(message);
    }
    return data as Map<String, dynamic>;
  }
}
