---
title: 题解：CF1766C Hamiltonian Wall
date: 2026-03-09 20:19:39
tags:
  - 题解
categories:
  - 题解
---
题目就是求 $s$ 是否可以一笔画。

像这样（样例）：

```
BWBBWB
BBBBBB
```

走法：

```
B  W  B--B  W  B
|     |  |     |
B--B--B  B--B--B
```

我们发现如果上面或下面没有走过且可以走，是一定要走。

如果上面或下面都走过了，就向后走。

另外形如：

```
BB
BW
```

就要特判是开始是第一行还是第二行，我的做法是都枚举一遍。

最后放上超长代码：

```cpp
#include<bits/stdc++.h>
#define int long long
using namespace std;
int T,n,fg,as,x,y,vis[200005][2]; char s[200005][2];
signed main(){
    cin>>T;
    while(T--){
        cin>>n,fg=as=0;
        for(int i=1;i<=n;i++) cin>>s[i][0];
        for(int i=1;i<=n;i++) cin>>s[i][1];
        for(int i=1;i<=n;i++)
            if(s[i][0]=='B'||s[i][1]=='B'){
                fg=i; break;
            }x=fg,y=0;
        if(s[x][0]==s[x][1]){
            y=0; int ans=0;
            while(x<n){
                if(s[x][1-y]=='B') y=1-y;
                // cout<<x<<' '<<y<<' '<<s[x+1][y]<<'\n';
                if(s[x+1][y]=='B') x++;
                else{as=1; break;}
            }if(!as) ans=1;
            x=fg,y=1,as=0;
            while(x<n){
                if(s[x][1-y]=='B') y=1-y;
                // cout<<x<<' '<<y<<' '<<s[x+1][y]<<'\n';
                if(s[x+1][y]=='B') x++;
                else{as=1; break;}
            }if(!as) ans=1;
            if(ans) cout<<"YES\n";
            else cout<<"NO\n";
        }else{
            if(s[x][0]=='B') y=0;
            else y=1;
            while(x<n){
                if(s[x][1-y]=='B') y=1-y;
                // cout<<x<<' '<<y<<' '<<s[x+1][y]<<'\n';
                if(s[x+1][y]=='B') x++;
                else{as=1; break;}
            }if(as) cout<<"NO\n";
            else cout<<"YES\n";
        }
    }
}
```