import 'package:flutter/material.dart';
import 'package:flutter_web_plugins/url_strategy.dart';
import 'package:go_router/go_router.dart';

import 'api.dart';
import 'models.dart';
import 'push.dart';

final api = Api();
final auth = ValueNotifier<bool?>(null);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();
  runApp(const HoyApp());
}

class HoyApp extends StatefulWidget {
  const HoyApp({super.key});

  @override
  State<HoyApp> createState() => _HoyAppState();
}

class _HoyAppState extends State<HoyApp> {
  final router = GoRouter(
    initialLocation: '/dia',
    routes: [
      GoRoute(path: '/', redirect: (context, state) => '/dia'),
      GoRoute(path: '/dia', builder: (context, state) => const DayScreen()),
      GoRoute(path: '/listas', builder: (context, state) => const ListsScreen()),
      GoRoute(path: '/listas/:id', builder: (context, state) => ListScreen(id: int.parse(state.pathParameters['id']!))),
      GoRoute(path: '/momento', builder: (context, state) => const MomentScreen()),
      GoRoute(path: '/semana', builder: (context, state) => const WeekScreen()),
      GoRoute(path: '/ajustes', builder: (context, state) => const SettingsScreen()),
      GoRoute(path: '/tarea/:id', builder: (context, state) => TaskScreen(id: int.parse(state.pathParameters['id']!))),
    ],
  );

  @override
  void initState() {
    super.initState();
    auth.addListener(() {
      if (mounted) setState(() {});
    });
    api.session().then((_) {
      auth.value = true;
    }).catchError((_) {
      auth.value = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'RUMBO',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xfff3efe7),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff0e6e68), surface: const Color(0xfffffcf8)),
        fontFamily: 'Segoe UI',
      ),
      routerConfig: router,
      builder: (context, child) {
        if (auth.value == null) return const Center(child: Text('Cargando'));
        if (auth.value == false) return LoginScreen(onDone: () => auth.value = true);
        return child ?? const SizedBox.shrink();
      },
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool creating = false;
  String error = '';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 420),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('HOY', style: TextStyle(letterSpacing: 2, color: Color(0xff6f685f))),
                const SizedBox(height: 8),
                const Text('Tu día, en orden.', style: TextStyle(fontSize: 36, fontFamily: 'Georgia')),
                const SizedBox(height: 24),
                TextField(controller: email, decoration: const InputDecoration(labelText: 'Correo'), keyboardType: TextInputType.emailAddress),
                TextField(controller: password, decoration: const InputDecoration(labelText: 'Contraseña'), obscureText: true),
                if (error.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error, style: const TextStyle(color: Color(0xff9c3b2e)))),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () async {
                    try {
                      if (creating) {
                        await api.register(email.text, password.text);
                      } else {
                        await api.login(email.text, password.text);
                      }
                      widget.onDone();
                    } catch (err) {
                      setState(() => error = '$err');
                    }
                  },
                  child: Text(creating ? 'Crear cuenta' : 'Entrar'),
                ),
                TextButton(
                  onPressed: () => setState(() {
                    creating = !creating;
                    error = '';
                  }),
                  child: Text(creating ? 'Ya tengo cuenta' : 'Crear cuenta'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class DayScreen extends StatelessWidget {
  const DayScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return TaskPage(
      title: greeting(),
      eyebrow: longDate(),
      query: 'view=myday',
      tabs: true,
      empty: 'Nada para hoy. Planear el día o añadir una tarea.',
      shortcuts: const [
        Shortcut('/momento', 'Planear el día'),
        Shortcut('/semana', 'Esta semana'),
      ],
    );
  }
}

class ListsScreen extends StatefulWidget {
  const ListsScreen({super.key});

  @override
  State<ListsScreen> createState() => _ListsScreenState();
}

class _ListsScreenState extends State<ListsScreen> {
  List<TaskList>? lists;
  final name = TextEditingController();
  String error = '';

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final rows = await api.lists();
      setState(() => lists = rows);
    } catch (err) {
      setState(() => error = '$err');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Shell(
      title: 'Listas',
      tabs: true,
      body: Column(
        children: [
          if (lists == null) const Text('Cargando'),
          for (final list in lists ?? [])
            ListTile(
              title: Text(list.name),
              trailing: Text('${list.openCount}'),
              onTap: () => context.push('/listas/${list.id}'),
            ),
          Row(
            children: [
              Expanded(child: TextField(controller: name, decoration: const InputDecoration(hintText: 'Nueva lista'))),
              FilledButton(
                onPressed: () async {
                  if (name.text.trim().isEmpty) return;
                  try {
                    await api.createList(name.text.trim());
                    name.clear();
                    await reload();
                  } catch (err) {
                    setState(() => error = '$err');
                  }
                },
                child: const Text('Crear'),
              ),
            ],
          ),
          if (error.isNotEmpty) Text(error),
        ],
      ),
    );
  }
}

class ListScreen extends StatelessWidget {
  const ListScreen({super.key, required this.id});
  final int id;

  @override
  Widget build(BuildContext context) {
    return TaskPage(title: 'Lista', query: 'listId=$id&sort=time', back: '/listas', empty: 'Esta lista está vacía.');
  }
}

class MomentScreen extends StatelessWidget {
  const MomentScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return TaskPage(title: 'Moment', query: 'view=moment', back: '/dia', empty: 'Nada esperando.', moment: true);
  }
}

class WeekScreen extends StatelessWidget {
  const WeekScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return TaskPage(title: 'Esta semana', query: 'view=week', back: '/dia', empty: 'La semana está libre.');
  }
}

class TaskScreen extends StatefulWidget {
  const TaskScreen({super.key, required this.id});
  final int id;

  @override
  State<TaskScreen> createState() => _TaskScreenState();
}

class _TaskScreenState extends State<TaskScreen> {
  Task? task;
  String error = '';

  @override
  void initState() {
    super.initState();
    api.task(widget.id).then((value) => setState(() => task = value)).catchError((err) => setState(() => error = '$err'));
  }

  @override
  Widget build(BuildContext context) {
    return Shell(
      title: 'Tarea',
      back: '/dia',
      body: task == null
          ? Text(error.isEmpty ? 'Abriendo la tarea' : error)
          : TaskTile(
              task: task!,
              onOpen: () => showTaskSheet(context, task: task),
              onChanged: () => api.task(widget.id).then((value) => setState(() => task = value)),
            ),
    );
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  String message = '';
  String error = '';
  bool pushReady = false;

  @override
  void initState() {
    super.initState();
    api.session().then((data) => setState(() => pushReady = data['push'] == true));
  }

  @override
  Widget build(BuildContext context) {
    return Shell(
      title: 'Ajustes',
      back: '/dia',
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('En el teléfono', style: TextStyle(fontSize: 18)),
          const SizedBox(height: 8),
          const Text('En Safari: Compartir, luego Añadir a pantalla de inicio. Ábrelo desde el icono.'),
          const SizedBox(height: 24),
          const Text('Recordatorios', style: TextStyle(fontSize: 18)),
          const Text('El aviso sale del servidor cuando llega la hora. El teléfono necesita red.'),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: pushReady
                ? () async {
                    try {
                      await enablePush(api);
                      setState(() {
                        message = 'Listo. Los recordatorios llegarán a este teléfono.';
                        error = '';
                      });
                    } catch (err) {
                      setState(() => error = '$err');
                    }
                  }
                : null,
            child: const Text('Activar notificaciones'),
          ),
          if (!pushReady) const Text('Faltan las llaves VAPID en el servidor.'),
          if (message.isNotEmpty) Text(message),
          if (error.isNotEmpty) Text(error, style: const TextStyle(color: Color(0xff9c3b2e))),
          const SizedBox(height: 24),
          OutlinedButton(
            onPressed: () async {
              await api.logout();
              auth.value = false;
            },
            child: const Text('Salir'),
          ),
        ],
      ),
    );
  }
}

class Shortcut {
  const Shortcut(this.path, this.label);
  final String path;
  final String label;
}

class TaskPage extends StatefulWidget {
  const TaskPage({
    super.key,
    required this.title,
    required this.query,
    required this.empty,
    this.eyebrow,
    this.back,
    this.tabs = false,
    this.shortcuts = const [],
    this.moment = false,
  });

  final String title;
  final String? eyebrow;
  final String query;
  final String empty;
  final String? back;
  final bool tabs;
  final List<Shortcut> shortcuts;
  final bool moment;

  @override
  State<TaskPage> createState() => _TaskPageState();
}

class _TaskPageState extends State<TaskPage> {
  List<Task>? tasks;
  List<TaskList> lists = [];

  @override
  void initState() {
    super.initState();
    reload();
  }

  Future<void> reload() async {
    try {
      final rows = await api.tasks(widget.query);
      final owned = await api.lists();
      if (mounted) {
        setState(() {
          tasks = rows;
          lists = owned;
        });
      }
    } catch (_) {
      if (mounted) setState(() => tasks = []);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = tasks ?? [];
    return Shell(
      title: widget.title,
      eyebrow: widget.eyebrow,
      back: widget.back,
      tabs: widget.tabs,
      action: widget.tabs ? IconButton(onPressed: () => context.push('/ajustes'), icon: const Icon(Icons.more_horiz)) : null,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            children: [
              for (final link in widget.shortcuts)
                ActionChip(label: Text(link.label), onPressed: () => context.push(link.path)),
            ],
          ),
          if (tasks == null) const Text('Cargando'),
          if (tasks != null && rows.isEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Text(widget.empty)),
          for (final task in rows)
            TaskTile(
              task: task,
              moment: widget.moment,
              onOpen: () => showTaskSheet(context, task: task, lists: lists, onChanged: reload),
              onChanged: reload,
            ),
          const SizedBox(height: 72),
        ],
      ),
      floating: FloatingActionButton.extended(
        onPressed: () => showTaskSheet(context, lists: lists, listId: lists.isEmpty ? null : lists.first.id, onChanged: reload),
        label: const Text('Añadir tarea'),
      ),
    );
  }
}

class TaskTile extends StatelessWidget {
  const TaskTile({super.key, required this.task, required this.onOpen, required this.onChanged, this.moment = false});

  final Task task;
  final VoidCallback onOpen;
  final Future<void> Function() onChanged;
  final bool moment;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(task.title, style: TextStyle(decoration: task.open ? null : TextDecoration.lineThrough)),
        subtitle: Text(_subtitle(task)),
        onTap: onOpen,
        trailing: Wrap(
          spacing: 4,
          children: [
            if (moment)
              IconButton(
                tooltip: 'Hoy',
                onPressed: () async {
                  await api.today(task.id);
                  await onChanged();
                },
                icon: const Icon(Icons.today),
              ),
            IconButton(
              tooltip: 'Hecho',
              onPressed: () async {
                await api.done(task.id);
                await onChanged();
              },
              icon: Icon(task.open ? Icons.check_circle_outline : Icons.check_circle),
            ),
          ],
        ),
      ),
    );
  }
}

class Shell extends StatelessWidget {
  const Shell({super.key, required this.title, required this.body, this.eyebrow, this.back, this.tabs = false, this.action, this.floating});

  final String title;
  final String? eyebrow;
  final String? back;
  final bool tabs;
  final Widget? action;
  final Widget body;
  final Widget? floating;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: floating,
      bottomNavigationBar: tabs
          ? NavigationBar(
              selectedIndex: GoRouterState.of(context).uri.path.startsWith('/listas') ? 1 : 0,
              onDestinationSelected: (index) => context.go(index == 0 ? '/dia' : '/listas'),
              destinations: const [
                NavigationDestination(icon: Icon(Icons.today_outlined), label: 'Mi día'),
                NavigationDestination(icon: Icon(Icons.list_alt), label: 'Listas'),
              ],
            )
          : null,
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
              children: [
                Row(
                  children: [
                    if (back != null) IconButton(onPressed: () => context.go(back!), icon: const Icon(Icons.arrow_back)),
                    const Spacer(),
                    if (action != null) action!,
                  ],
                ),
                if (eyebrow != null) Text(eyebrow!, style: const TextStyle(letterSpacing: 1.4, color: Color(0xff6f685f))),
                Text(title, style: const TextStyle(fontSize: 36, fontFamily: 'Georgia', height: 1.05)),
                const SizedBox(height: 16),
                body,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showTaskSheet(BuildContext context, {Task? task, List<TaskList> lists = const [], int? listId, Future<void> Function()? onChanged}) async {
  final owned = lists.isEmpty ? await api.lists() : lists;
  if (!context.mounted) return;
  final title = TextEditingController(text: task?.title ?? '');
  final notes = TextEditingController(text: task?.notes ?? '');
  var selected = task?.listId ?? listId ?? (owned.isEmpty ? 0 : owned.first.id);
  var remind = task?.remindAt != null;
  var pinned = task?.pinned ?? false;
  final days = <int>{...(task?.repeatWeekdays ?? const <int>[])};
  final due = TextEditingController(text: _dateInput(task?.dueAt));
  final time = TextEditingController(text: _timeInput(task?.dueAt));
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (context) {
      return StatefulBuilder(
        builder: (context, setLocal) {
          return Padding(
            padding: EdgeInsets.fromLTRB(18, 18, 18, 18 + MediaQuery.viewInsetsOf(context).bottom),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(task == null ? 'Nueva tarea' : 'Tarea', style: const TextStyle(fontSize: 22)),
                TextField(controller: title, decoration: const InputDecoration(labelText: 'Título')),
                TextField(controller: notes, decoration: const InputDecoration(labelText: 'Nota')),
                DropdownButton<int>(
                  value: selected == 0 ? null : selected,
                  hint: const Text('Lista'),
                  items: [for (final list in owned) DropdownMenuItem(value: list.id, child: Text(list.name))],
                  onChanged: (value) => setLocal(() => selected = value ?? selected),
                ),
                TextField(controller: due, decoration: const InputDecoration(labelText: 'Fecha AAAA-MM-DD')),
                TextField(controller: time, decoration: const InputDecoration(labelText: 'Hora HH:MM')),
                SwitchListTile(value: remind, title: const Text('Recordatorio'), onChanged: (value) => setLocal(() => remind = value)),
                SwitchListTile(value: pinned, title: const Text('Fijar en mi día'), onChanged: (value) => setLocal(() => pinned = value)),
                Wrap(
                  spacing: 6,
                  children: [
                    for (final entry in const [(1, 'L'), (2, 'M'), (3, 'X'), (4, 'J'), (5, 'V'), (6, 'S'), (7, 'D')])
                      FilterChip(
                        label: Text(entry.$2),
                        selected: days.contains(entry.$1),
                        onSelected: (selectedDay) => setLocal(() {
                          if (selectedDay) {
                            days.add(entry.$1);
                          } else {
                            days.remove(entry.$1);
                          }
                        }),
                      ),
                  ],
                ),
                FilledButton(
                  onPressed: () async {
                    final input = TaskInput(
                      listId: selected,
                      title: title.text,
                      notes: notes.text,
                      dueAt: _combine(due.text, time.text),
                      remind: remind,
                      pinned: pinned,
                      repeatWeekdays: days.toList()..sort(),
                    );
                    if (task == null) {
                      await api.createTask(input);
                    } else {
                      await api.updateTask(task.id, input);
                    }
                    if (context.mounted) Navigator.pop(context);
                    await onChanged?.call();
                  },
                  child: const Text('Guardar'),
                ),
                if (task != null)
                  TextButton(
                    onPressed: () async {
                      await api.deleteTask(task.id);
                      if (context.mounted) Navigator.pop(context);
                      await onChanged?.call();
                    },
                    child: const Text('Borrar'),
                  ),
              ],
            ),
          );
        },
      );
    },
  );
}

String greeting([DateTime? now]) {
  final hour = (now ?? DateTime.now()).hour;
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

String longDate([DateTime? now]) {
  const weekdays = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  final date = now ?? DateTime.now();
  final text = '${weekdays[date.weekday - 1]} ${date.day} de ${months[date.month - 1]}';
  return text[0].toUpperCase() + text.substring(1);
}

String _subtitle(Task task) {
  final bits = <String>[
    if (task.dueDay != null) task.dueDay!,
    if (task.pinned) 'Fijada',
    if (task.repeatWeekdays.isNotEmpty) 'Repite',
  ];
  return bits.join(' · ');
}

String _dateInput(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final date = DateTime.parse(iso).toLocal();
  final month = date.month.toString().padLeft(2, '0');
  final day = date.day.toString().padLeft(2, '0');
  return '${date.year}-$month-$day';
}

String _timeInput(String? iso) {
  if (iso == null || iso.isEmpty) return '08:00';
  final date = DateTime.parse(iso).toLocal();
  return '${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}

String? _combine(String date, String time) {
  if (date.trim().isEmpty) return null;
  final parts = date.split('-').map(int.parse).toList();
  final clock = (time.isEmpty ? '08:00' : time).split(':').map(int.parse).toList();
  return DateTime(parts[0], parts[1], parts[2], clock[0], clock[1]).toUtc().toIso8601String();
}
