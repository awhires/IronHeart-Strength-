import 'package:flutter/material.dart';

void main() {
  runApp(const IronHeartApp());
}

class IronHeartApp extends StatelessWidget {
  const IronHeartApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'IronHeart Strength',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.red,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF111111),
      appBar: AppBar(
        title: const Text('IronHeart Strength'),
        backgroundColor: const Color(0xFF1C1C1C),
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Welcome to IronHeart',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Build strength. Track progress. Train with purpose.',
              style: TextStyle(
                fontSize: 18,
                color: Colors.white70,
              ),
            ),
            const SizedBox(height: 32),
            Card(
              color: const Color(0xFF222222),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text(
                      'Athlete Profile',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    SizedBox(height: 16),
                    Text('Name: New Athlete'),
                    Text('Goal: Build strength'),
                    Text('Level: Beginner'),
                    Text('Next workout: Full Body Foundation'),
                  ],
                ),
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: null,
                child: Text('Start Training'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
