class TaskList {
  TaskList({required this.id, required this.name, required this.position, required this.openCount});

  final int id;
  final String name;
  final int position;
  final int openCount;

  factory TaskList.fromJson(Map<String, dynamic> json) => TaskList(
        id: json['id'] as int,
        name: json['name'] as String,
        position: json['position'] as int,
        openCount: json['openCount'] as int,
      );
}

class Task {
  Task({
    required this.id,
    required this.listId,
    required this.title,
    required this.notes,
    required this.dueAt,
    required this.remindAt,
    required this.status,
    required this.pinned,
    required this.position,
    required this.repeatWeekdays,
    required this.completedAt,
    required this.section,
    required this.dueDay,
  });

  final int id;
  final int listId;
  final String title;
  final String notes;
  final String? dueAt;
  final String? remindAt;
  final String status;
  final bool pinned;
  final int position;
  final List<int> repeatWeekdays;
  final String? completedAt;
  final String section;
  final String? dueDay;

  bool get open => status == 'open';

  factory Task.fromJson(Map<String, dynamic> json) => Task(
        id: json['id'] as int,
        listId: json['listId'] as int,
        title: json['title'] as String,
        notes: json['notes'] as String? ?? '',
        dueAt: json['dueAt'] as String?,
        remindAt: json['remindAt'] as String?,
        status: json['status'] as String,
        pinned: json['pinned'] as bool? ?? false,
        position: json['position'] as int? ?? 0,
        repeatWeekdays: (json['repeatWeekdays'] as List<dynamic>? ?? []).map((day) => day as int).toList(),
        completedAt: json['completedAt'] as String?,
        section: json['section'] as String? ?? 'someday',
        dueDay: json['dueDay'] as String?,
      );
}

class TaskInput {
  TaskInput({
    required this.listId,
    required this.title,
    required this.notes,
    required this.dueAt,
    required this.remind,
    required this.pinned,
    required this.repeatWeekdays,
  });

  final int listId;
  final String title;
  final String notes;
  final String? dueAt;
  final bool remind;
  final bool pinned;
  final List<int> repeatWeekdays;

  Map<String, dynamic> toJson() => {
        'listId': listId,
        'title': title,
        'notes': notes,
        'dueAt': dueAt,
        'remind': remind,
        'pinned': pinned,
        'repeatWeekdays': repeatWeekdays,
      };
}
